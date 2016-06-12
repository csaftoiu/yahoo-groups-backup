#!/usr/bin/env python
"""
Yahoo! Groups backup scraper.

Usage:
  yahoo-groups-backup.py scrape_all [options] <group_name>
  yahoo-groups-backup.py dump_site [options] <group_name> <root_dir>
  yahoo-groups-backup.py -h | --help

Commands:
  scrape_all     Scrape the entire group and insert it into the mongo database
  dump_site      Dump the entire backup as a static website at the given root
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
import random
import sys
import time

from docopt import docopt
from jinja2 import Template, FileSystemLoader, Environment
import lzstring
import pymongo
import schema
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
    whose name is the same as the group name.

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

    If a message is missing, then the document will contain an `_id` field and nothing else.
    """
    def __init__(self, mongo_cli, group_name):
        self.group_name = group_name

        self.cli = mongo_cli
        self.db = getattr(self.cli, group_name)

        self._ensure_indices()

    def _ensure_indices(self):
        self.db.messages.create_index([("postDate", pymongo.ASCENDING)])
        self.db.messages.create_index([("authorName", pymongo.ASCENDING)])
        self.db.messages.create_index([("from", pymongo.ASCENDING)])
        self.db.messages.create_index([("profile", pymongo.ASCENDING)])

    def has_message(self, message_number):
        """Return whether we already have the given message number loaded."""
        return bool(self.db.messages.find_one({'_id': message_number}))

    def insert_message(self, message_number, message_obj):
        """Insert the message document, for the given message number. Will raise an exception if the message
        is already stored. For a missing message, pass `None` for `message_obj`."""
        if not message_obj:
            self.db.messages.insert_one({'_id': message_number})
        else:
            assert message_number == message_obj['msgId']

            doc = {**message_obj, '_id': message_number}
            del doc['msgId']
            self.db.messages.insert_one(doc)

    def yield_all_messages(self):
        """Yield all existing messages (skipping missing ones), in reverse message_id order."""
        for msg in self.db.messages.find().sort('_id', -1):
            if not msg.get('messageBody'):
                continue

            yield msg

    def num_messages(self):
        """Return the number of messages in the database."""
        return self.db.messages.count()

    def get_latest_message(self):
        """Return the latest message."""
        return next(self.yield_all_messages())


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


def message_author(msg):
    """Return a formatted message author from a msg object."""
    if msg['authorName'] and msg['authorName'] != msg['profile']:
        res = "%s (%s)" % (msg['authorName'], msg['profile'])
    else:
        res = "%s" % (msg['profile'],)

    if msg['from']:
        res += " <%s>" % msg['from']

    return res


def scrape_all(arguments):
    cli = pymongo.MongoClient(arguments['--mongo-host'], arguments['--mongo-port'])
    db = YahooBackupDB(cli, arguments['<group_name>'])
    scraper = YahooBackupScraper(arguments['<group_name>'], arguments['--login'], arguments['--password'])

    last_message = scraper.get_last_message_number()
    cur_message = last_message
    skipped = 0
    while cur_message >= 1:
        if db.has_message(cur_message):
            skipped += 1
            cur_message -= 1
            continue
        else:
            if skipped > 0:
                eprint("Skipped %s messages we already processed." % skipped)
                skipped = 0

        msg = scraper.get_message(cur_message)
        db.insert_message(cur_message, msg)
        if not msg:
            eprint("Message #%s is missing" % (cur_message,))
        else:
            eprint("Inserted message #%s by %s" % (cur_message, message_author(msg)))

        cur_message -= 1

    eprint("All messages from the beginning up to #%s have been scraped!" % (last_message,))


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

    # make the paths
    os.makedirs(root_dir)
    os.makedirs(os.path.join(root_dir, messages_subdir))

    loader = FileSystemLoader(searchpath="./templates/")
    env = Environment(loader=loader)
    env.globals['group_name'] = arguments['<group_name>']
    env.globals['get_display_name'] = message_author
    env.globals['get_formatted_date'] = get_formatted_date

    def render_to_file(filename, template, template_args, encoding='utf8'):
        if isinstance(template, str):
            template = env.get_template(template)
        open(os.path.join(root_dir, filename), "w", encoding=encoding).write(template.render(**template_args))

    eprint("Rendering data...")
    eprint("   Building messages list...")
    messages = []
    for msg in db.yield_all_messages():
        messages.append({
            'subject': msg.get('subject', ''),
            'author': message_author(msg),
            'timestamp': msg['postDate'],
            'number': msg['_id'],
            'body': msg['messageBody'],
        })

    eprint("   Dumping to JSON...")
    messages_json = json.dumps(messages, separators=(',',':'))

    eprint("   Compressing %.2fkB..." % (len(messages_json) / 1024))
    compressed = lzstring.LZString().compressToUTF16(messages_json)

    eprint("   Writing compressed data...")
    render_to_file('data.js', 'data.js', {
        'data': compressed,
    }, encoding='utf16')

    # eprint("Rendering index...")
    # render_to_file('index.html', 'index.html', {
    #     'path_to_root': '.',
    #     'messages': db.yield_all_messages(),
    # })

    # eprint("Rendering about page...")
    # render_to_file('about.html', 'about.html', {
    #     'path_to_root': '.',
    #     'last_message_date': get_formatted_date(db.get_latest_message()),
    # })
    #
    # num_messages = db.num_messages()
    # eprint("Rendering %d messages..." % num_messages)
    # for i, msg in enumerate(db.yield_all_messages()):
    #     if i % 1000 == 0:
    #         eprint("    %d/%d..." % (i+1, num_messages))
    #     render_to_file(os.path.join(messages_subdir, '%s.html' % msg['_id']), 'message.html', {
    #         'path_to_root': '..',
    #         'message': msg,
    #     })

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

    if arguments['scrape_all']:
        scrape_all(arguments)
    elif arguments['dump_site']:
        dump_site(arguments)
