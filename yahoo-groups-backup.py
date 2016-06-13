#!/usr/bin/env python
"""
Yahoo! Groups backup scraper.

Usage:
  yahoo-groups-backup.py scrape_messages [options] <group_name>
  yahoo-groups-backup.py scrape_files [options] <group_name>
  yahoo-groups-backup.py dump_site [options] <group_name> <root_dir>
  yahoo-groups-backup.py -h | --help

Commands:
  scrape_messages     Scrape all group messages that are not scraped yet and insert it into the mongo database
  scrape_files        Scrape the group files and insert them into the mongo database
  dump_site           Dump the entire backup as a static website at the given root
                      directory

Options:
  -h --help                                   Show this screen
  -d --delay=<delay>                          Delay before scraping each message, to avoid rate limiting.
                                              Delays by a gaussian distribution with average <delay> and
                                              standard deviation <delay>/2. [default: 1]
  -c --config=<config_file>                   Use config file, if it exists [default: settings.yaml]
                                              Command-line settings override the config file settings
                                              "--mongo-host=foo" converts to "mongo-host: foo" in the
                                              config file.
  [(--login=<login> --password=<password>)]   Specify Yahoo! Groups login (required for private groups)
  --mongo-host=<hostname>                     Hostname for mongo database [default: localhost]
  --mongo-port=<port>                         Port for mongo database [default: 27017]

"""
import json
import os
import platform
import random
import sys
import time
import urllib.parse

import dateutil.parser
from docopt import docopt
import gridfs
import jinja2
import pymongo
import requests
import schema
from selenium.webdriver.common.keys import Keys
import splinter
import yaml


args_schema = schema.Schema({
    '--mongo-port': schema.And(schema.Use(int), lambda n: 1 <= n <= 65535, error='Invalid mongo port'),
    '--delay': schema.And(schema.Use(float), lambda n: n > 0, error='Invalid delay, must be number > 0'),
    object: object,
})


def eprint(*args, **kwargs):
    return print(*args, **kwargs, file=sys.stderr)


class YahooBackupDB:
    """Interface to store Yahoo! Group messages to a MongoDB. Group data is stored in a database
    whose name is the same as the group name. File data is stored in that database name plus `_gridfs`, where
    the gridfs _id is teh same as the file document _id, which is also the file path.

    The `messages` collection contains all the message data returned by the Yahoo! Groups API.
    Notable fields:
        * '_id' - the message id ('msgId' from the API)
        * 'authorName' - often empty, but may have a name
        * 'from' - sender's email address
        * 'profile' - profile name of the poster
        * 'subject' - the subject
        * 'postDate' - a timestamp of when the post was made
        * 'messageBody' - the message body, as formatted HTML
        * 'rawEmail' - the full raw email, with headers and everything
        * 'nextInTime' - next message id, in time order
        * 'nextInTopic' - next message id, in topic order
        * 'prevInTime' - prev message id, in time order
        * 'prevInTopic' - prev message id, in topic order
    If a message is missing, then the document will contain an `_id` field and nothing else.

    The `files` collection contains all the data about files:
        * `_id` - the full file path and name (unique)
        * `url` - the url the file was downloaded from
        * `mime` - file mimetype
        * `size` - file size as reported by yahoo - float, in kilobytes
        * `profile` - profile of user that posted the file
        * `date` - date listed on the Yahoo! Group for the file
    """
    def __init__(self, mongo_cli, group_name):
        self.group_name = group_name

        self.cli = mongo_cli
        self.db = getattr(self.cli, group_name)
        self.fs = gridfs.GridFS(getattr(self.cli, "%s_gridfs" % group_name))

        self._ensure_indices()

    def _ensure_indices(self):
        self.db.messages.create_index([("postDate", pymongo.ASCENDING)])
        self.db.messages.create_index([("authorName", pymongo.ASCENDING)])
        self.db.messages.create_index([("from", pymongo.ASCENDING)])
        self.db.messages.create_index([("profile", pymongo.ASCENDING)])

    def has_updated_message(self, message_number):
        """Return whether we already have the given message number loaded and fully updated."""
        query = self.db.messages.find({'_id': message_number})
        if not query.count():
            return False

        msg = query[0]
        if msg.get('nextInTime', None) == 0:
            # maybe need to update the 'next' link
            eprint("Message may need updated 'next' link")
            return False

        return True

    def upsert_message(self, message_number, message_obj):
        """Insert the message document, for the given message number. If the message is already stored, will
        update it. For a missing message, pass `None` for `message_obj`."""
        if not message_obj:
            self.db.messages.insert_one({'_id': message_number})
        else:
            assert message_number == message_obj['msgId']

            doc = {**message_obj, '_id': message_number}
            del doc['msgId']
            self.db.messages.update_one({'_id': message_number}, {'$set': doc}, upsert=True)

    def yield_all_messages(self):
        """Yield all existing messages (skipping missing ones), in reverse message_id order."""
        for msg in self.db.messages.find().sort('_id', -1):
            if not msg.get('messageBody'):
                continue

            yield msg

    def num_messages(self):
        """Return the number of non-empty messages in the database."""
        return self.db.messages.find({'messageBody': {'$exists': True}}).count()

    def get_latest_message(self):
        """Return the latest message."""
        return next(self.yield_all_messages())

    def missing_message_ids(self):
        """Return the set of the ids of all missing messages.."""
        latest = self.get_latest_message()
        ids = set(range(1, latest['_id']+1))
        present_ids = set(doc['_id'] for doc in self.db.messages.find({}, {'_id': 1}))
        return ids - present_ids

    # -- File operations

    def has_file_entry(self, filePath):
        return self.db.files.find({'_id': filePath}).count() > 0

    def has_file_data(self, filePath):
        return self.fs.exists({'_id': filePath})

    def upsert_file_entry(self, file_entry):
        doc = {**file_entry, '_id': file_entry['filePath']}
        del doc['filePath']
        self.db.files.update_one({'_id': doc['_id']}, {'$set': doc}, upsert=True)

    def update_file_data(self, file_path, data):
        if self.fs.exists({'_id': file_path}):
            self.fs.delete(file_path)

        self.fs.put(data, _id=file_path, filename=file_path)

    def yield_all_files(self):
        """Yield all (file_entry, grid_out_file) for all files in the database."""
        for entry in self.db.files.find():
            data = None
            if self.fs.exists({'_id': entry['_id']}):
                data = self.fs.get(entry['_id'])
            yield entry, data


class YahooBackupScraper:
    """Scrape Yahoo! Group messages with Selenium. Login information is required for
    private groups."""

    def __init__(self, group_name, login_email=None, password=None, delay=1):
        self.group_name = group_name
        self.login_email = login_email
        self.password = password
        self.delay = delay

        self.br = splinter.Browser()

    def __del__(self):
        self.br.quit()

    def _is_login_page(self):
        html = self.br.html
        return "Enter your email" in html and "Sign in" in html

    def _process_login_page(self):
        """Process the login page."""
        if not self.login_email or not self.password:
            raise ValueError("Detected private group! Login information is required")

        eprint("Processing the log-in page...")

        # email ...
        self.br.fill("username", self.login_email)
        time.sleep(1)
        self.br.find_by_name("signin").click()
        # Wait ...
        time.sleep(2)

        # password ...
        self.br.fill("passwd", self.password)
        time.sleep(1)
        self.br.find_by_name("signin").click()
        # Wait ...
        time.sleep(2)

    def _visit_with_login(self, url):
        """Visit the given URL. Logs in if necessary."""
        self.br.visit(url)

        if self._is_login_page():
            self._process_login_page()
            # get the page again
            self.br.visit(url)

        if self._is_login_page():
            raise RuntimeError("Unable to login")

        return

    def _load_json_url(self, url):
        """Given a URL which returns a JSON response, return the loaded object. A bit hacky to deal with
        Selenium wrapping the JSON in <html>...<body><pre>...</pre></body></html>."""
        self._visit_with_login(url)
        return json.loads(self.br.find_by_tag("pre")[0].text)

    def get_last_message_number(self):
        """Return the latest message number in the group."""
        url = "https://groups.yahoo.com/api/v1/groups/%s/messages?count=1&sortOrder=desc&direction=-1" % (
            self.group_name,
        )
        return self._load_json_url(url)['ygData']['messages'][0]['messageId']

    @staticmethod
    def _massage_message(data):
        """Given a msg, massage it so it's a bit more sensible."""
        # convert the timestamp to an integer, if possible
        try:
            data['postDate'] = int(data['postDate'])
        except (KeyError, ValueError, TypeError):
            eprint("Warning: got a non-int 'postDate' for message #%s: %s" % (
                data.get('msgId'), data.get('postDate')),
            )

        # 'profile' is sometimes missing (??)
        if 'profile' not in data:
            data['profile'] = None

        # parse out the from to keep only the email. If th
        if '&lt;' in data['from'] or '&gt;'in data['from']:
            assert '&lt;' in data['from'] and '&gt;' in data['from']
            stripped_name, from_remainder = data['from'].split('&lt;', 1)
            stripped_name = stripped_name.strip()
            # make sure we're not losing any information
            if stripped_name.startswith("&quot;"):
                assert stripped_name.endswith("&quot;")
                stripped_name = stripped_name[6:-6].strip()

            # if we have a weird encoding thing then forget it
            if not stripped_name.startswith("=?"):
                assert stripped_name.strip() == data['authorName'].strip()

            # leave only the email in
            data['from'], leftover = from_remainder.split('&gt;', 1)
            # make sure lost nothing on the right side
            assert not leftover.strip()

        # replace no_reply with None for missing emails
        if data['from'] == 'no_reply@yahoogroups.com':
            data['from'] = None

        return data

    def get_message(self, message_number):
        """Get the data for the given message number. Returns None if the message doesn't exist.
        Returns the object in the 'ygData' key returned by the Yahoo! Groups API,
        with both the HTML and the raw data in it."""
        # delay to prevent rate limiting
        time.sleep(max(0, random.gauss(self.delay, self.delay / 2)))
        url = "https://groups.yahoo.com/api/v1/groups/%s/messages/%s" % (self.group_name, message_number)

        formatted = self._load_json_url(url)
        if 'ygError' in formatted:
            if formatted['ygError']['httpStatus'] == 404:
                return None
            if formatted['ygError']['httpStatus'] == 500:
                eprint("Got unexpected server error, trying again...")
                return self.get_message(message_number)
            raise RuntimeError("Unexpected error:\n\n%s" % json.dumps(formatted))

        raw = self._load_json_url(url + "/raw")

        data = formatted['ygData']
        data['rawEmail'] = raw['ygData']['rawEmail']

        try:
            return self._massage_message(data)
        except:
            import pprint
            eprint("Failed to process message:\n%s" % (pprint.pformat(data)))
            raise

    def open_tab(self):
        if platform.system() == 'Darwin':
            key_sequence = Keys.COMMAND + 't'
        else:
            key_sequence = Keys.CONTROL + 't'

        self.br.driver.find_element_by_tag_name('body').send_keys(key_sequence)
        time.sleep(1)

    def close_tab(self):
        if platform.system() == 'Darwin':
            key_sequence = Keys.COMMAND + 'w'
        else:
            key_sequence = Keys.CONTROL + 'w'

        self.br.driver.find_element_by_tag_name('body').send_keys(key_sequence)
        time.sleep(1)

    def yield_walk_files(self, path="."):
        """Starting from `path`, yield a dict describing each file, and recurse into subdirectories."""
        url = "https://groups.yahoo.com/neo/groups/%s/files/%s/" % (self.group_name, path)

        self._visit_with_login(url)

        # get all elements with data-file - these are the file entries
        for el in self.br.find_by_xpath("//*[@data-file]"):
            # get the data
            data = el._element.get_attribute('data-file')
            # data is escaped; unescape it & interpret as JSON object
            data = json.loads('{' + data.encode('utf8').decode('unicode_escape') + '}')

            if data['fileType'] == 'd':
                # recur into subdirectory
                self.open_tab()
                yield from self.yield_walk_files(data['filePath'])
                self.close_tab()
            elif data['fileType'] == 'f':
                url = el.find_by_tag('a')[0]._element.get_attribute('href')
                profile = el._element.find_element_by_class_name('yg-list-auth').text
                date_str = el._element.find_element_by_class_name('yg-list-date').text
                the_date = dateutil.parser.parse(date_str)

                yield {
                    'filePath': urllib.parse.unquote(data['filePath']),
                    'url': url,
                    'mime': data['mime'],
                    'size': float(data['size']),
                    'profile': profile,
                    'date': the_date,
                }
            else:
                raise NotImplementedError("Unknown fileType %s, data was %s" % (
                    data['fileType'], json.dumps(data),
                ))


def message_author(msg, include_email, hide_email=True):
    """Return a formatted message author from a msg object."""
    if msg['authorName'] and msg['authorName'] != msg['profile']:
        res = "%s (%s)" % (msg['authorName'], msg['profile'])
    else:
        res = "%s" % (msg['profile'],)

    if include_email and msg['from']:
        if hide_email:
            disp = msg['from'].rsplit("@", 1)[0] + "@..."
        else:
            disp = msg['from']
        res += " <%s>" % disp

    return res


def scrape_messages(arguments):
    cli = pymongo.MongoClient(arguments['--mongo-host'], arguments['--mongo-port'])
    db = YahooBackupDB(cli, arguments['<group_name>'])
    scraper = YahooBackupScraper(arguments['<group_name>'], arguments['--login'], arguments['--password'])

    skipped = [0]
    def print_skipped(min):
        if skipped[0] >= min:
            eprint("Skipped %s messages we already processed" % skipped[0])
            skipped[0] = 0

    last_message = scraper.get_last_message_number()
    cur_message = last_message
    while cur_message >= 1:
        if db.has_updated_message(cur_message):
            skipped[0] += 1
            print_skipped(1000)
            cur_message -= 1
            continue

        msg = scraper.get_message(cur_message)
        db.upsert_message(cur_message, msg)
        if not msg:
            eprint("Message #%s is missing" % (cur_message,))
        else:
            eprint("Inserted message #%s by %s" % (cur_message, message_author(msg, True)))

        cur_message -= 1

    print_skipped(0)
    eprint("All messages from the beginning up to #%s have been scraped!" % (last_message,))


def scrape_files(arguments):
    cli = pymongo.MongoClient(arguments['--mongo-host'], arguments['--mongo-port'])
    db = YahooBackupDB(cli, arguments['<group_name>'])
    scraper = YahooBackupScraper(arguments['<group_name>'], arguments['--login'], arguments['--password'])

    for file_info in scraper.yield_walk_files():
        import pprint; pprint.pprint(file_info)
        if not db.has_file_entry(file_info['filePath']) or not db.has_file_data(file_info['filePath']):
            eprint("Inserting file '%s'..." % file_info['filePath'])
            file_data = requests.get(file_info['url']).content
            db.upsert_file_entry(file_info)
            db.update_file_data(file_info['filePath'], file_data)
        else:
            eprint("Already had file '%s'" % file_info['filePath'])

    eprint("Done processing all files!")


def dump_site(arguments):
    # helpers
    import datetime

    def get_formatted_date(message):
        timestamp = message['postDate']
        dt = datetime.datetime.fromtimestamp(timestamp)
        return dt.strftime("%b-%d-%y, %I:%M %p")

    # setup
    cli = pymongo.MongoClient(arguments['--mongo-host'], arguments['--mongo-port'])
    db = YahooBackupDB(cli, arguments['<group_name>'])
    root_dir = arguments['<root_dir>']

    if os.path.exists(root_dir):
        sys.exit("Root site directory already exists. Specify a new directory or delete the existing one.")

    messages_subdir = "messages"
    files_subdir = "files"

    # make the paths
    os.makedirs(root_dir)
    os.makedirs(os.path.join(root_dir, messages_subdir))
    os.makedirs(os.path.join(root_dir, files_subdir))

    # dump files
    def sanitize_filename(fn):
        return ''.join(c if (c.isalnum() or c in ' ._-') else '_' for c in fn)

    eprint("Dumping all files...")
    for ent, file_f in db.yield_all_files():
        if file_f is None:
            eprint("Skipping '%s', have no data for this file..." % (ent['_id'],))
            continue

        # split to pieces, ignore first empty piece, sanitize each piece, put back together
        sanitized = '/'.join(map(sanitize_filename, ent['_id'].split('/')[1:]))
        full_path = os.path.join(root_dir, files_subdir, sanitized)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "wb") as f:
            for chunk in file_f:
                f.write(chunk)

    loader = jinja2.FileSystemLoader(searchpath="./templates/")
    env = jinja2.Environment(loader=loader)
    env.globals['group_name'] = arguments['<group_name>']
    env.globals['get_display_name'] = lambda *a, **kw: jinja2.escape(message_author(*a, **kw))
    env.globals['get_formatted_date'] = get_formatted_date

    def render_to_file(filename, template, template_args):
        if 'path_to_root' not in template_args:
            raise ValueError("template_args must contain 'path_to_root'")

        if isinstance(template, str):
            template = env.get_template(template)
        open(os.path.join(root_dir, filename), "w").write(template.render(**template_args))

    missing_ids = db.missing_message_ids()
    if missing_ids:
        eprint("")
        eprint("WARNING! Backup is not complete, missing %s messages! Site will be incomplete." % (
            len(missing_ids),
        ))
        eprint("")

    eprint("Rendering index...")
    render_to_file('index.html', 'index.html', {
        'path_to_root': '.',
        'messages': db.yield_all_messages(),
    })

    eprint("Rendering about page...")
    render_to_file('about.html', 'about.html', {
        'path_to_root': '.',
        'last_message_date': get_formatted_date(db.get_latest_message()),
    })

    num_messages = db.num_messages()
    eprint("Rendering %d messages..." % num_messages)
    for i, msg in enumerate(db.yield_all_messages()):
        if i % 1000 == 0:
            eprint("    %d/%d..." % (i+1, num_messages))
        render_to_file(os.path.join(messages_subdir, '%s.html' % msg['_id']), 'message.html', {
            'path_to_root': '..',
            'message': msg,
        })

    eprint("Site is ready in '%s'!" % root_dir)


if __name__ == "__main__":
    arguments = docopt(__doc__, version='Yahoo! Groups Backup-er 0.1')

    if arguments['--config'] != 'settings.yaml' and not os.path.exists(arguments['--config']):
        eprint("Specified config file '%s' does not exist." % arguments['--config'])
        sys.exit(1)

    if os.path.exists(arguments['--config']):
        settings = yaml.load(open(arguments['--config']))
        command_line_args = arguments
        arguments = {}
        for key, val in settings.items():
            arguments['--%s' % key] = val
        arguments.update(command_line_args)

    try:
        arguments = args_schema.validate(arguments)
    except schema.SchemaError as e:
        sys.exit(e.code)

    if arguments['scrape_messages']:
        scrape_messages(arguments)
    elif arguments['scrape_files']:
        scrape_files(arguments)
    elif arguments['dump_site']:
        dump_site(arguments)
