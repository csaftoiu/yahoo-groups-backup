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

Static Site Options:
  --msgdb-page-size=<page_size>               Number of messages to store in each local file. Larger means less files
                                              but each file is larger, while smaller means more files but each file
                                              is more manageable. [default: 500]
  --redact-before=<message_id>                Redact messages before this message number. Used to dump smaller sits
                                              for testing. [default: 0]

Scraping Options:
  -d --delay=<delay>                          Delay before scraping each message, to avoid rate limiting.
                                              Delays by a gaussian distribution with average <delay> and
                                              standard deviation <delay>/2. [default: 1]
  [(--login=<login> --password=<password>)]   Specify Yahoo! Groups login (required for private groups)


Shared Options:
  -h --help                                   Show this screen
  -c --config=<config_file>                   Use config file, if it exists [default: settings.yaml]
                                              Command-line settings override the config file settings
                                              "--mongo-host=foo" converts to "mongo-host: foo" in the
                                              config file.
  --mongo-host=<hostname>                     Hostname for mongo database [default: localhost]
  --mongo-port=<port>                         Port for mongo database [default: 27017]
  --driver=<driver>                           Specify a webdriver for Selenium [default: firefox]

"""
import json
import os
import sys
import time

from docopt import docopt
import pymongo
import requests
import schema
import yaml

from yahoo_groups_backup import YahooBackupDB, YahooBackupScraper, html_from_message
from yahoo_groups_backup.message import unescape_yahoo_html


args_schema = schema.Schema({
    '--mongo-port': schema.And(schema.Use(int), lambda n: 1 <= n <= 65535, error='Invalid mongo port'),
    '--delay': schema.And(schema.Use(float), lambda n: n > 0, error='Invalid delay, must be number > 0'),
    '--msgdb-page-size': schema.Use(int),
    '--redact-before': schema.Use(int),
    object: object,
})


def eprint(*args, **kwargs):
    return print(*args, **kwargs, file=sys.stderr)


def mask_email(email):
    if not email:
        return ''
    return email.rsplit("@", 1)[0] + "@...";


def scrape_messages(arguments):
    cli = pymongo.MongoClient(arguments['--mongo-host'], arguments['--mongo-port'])
    db = YahooBackupDB(cli, arguments['<group_name>'])
    scraper = YahooBackupScraper(
        arguments['<group_name>'], arguments['--driver'], arguments['--login'],
        arguments['--password'])

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
            eprint("Inserted message #%s by %s/%s/%s" % (
                cur_message,
                msg['authorName'], msg['profile'], msg['from']))

        cur_message -= 1

    print_skipped(0)
    eprint("All messages from the beginning up to #%s have been scraped!" % (last_message,))


def scrape_files(arguments):
    cli = pymongo.MongoClient(arguments['--mongo-host'], arguments['--mongo-port'])
    db = YahooBackupDB(cli, arguments['<group_name>'])
    scraper = YahooBackupScraper(
        arguments['<group_name>'], arguments['--driver'], arguments['--login'],
        arguments['--password'])

    for file_info in scraper.yield_walk_files():
        if not db.has_file_entry(file_info['filePath']) or not db.has_file_data(file_info['filePath']):
            eprint("Inserting file '%s'..." % file_info['filePath'])
            file_data = requests.get(file_info['url']).content
            db.upsert_file_entry(file_info)
            db.update_file_data(file_info['filePath'], file_data)
        else:
            eprint("Already had file '%s'" % file_info['filePath'])

    eprint("Done processing all files!")


def dump_site(arguments):
    import shutil

    # -----------------
    # setup
    cli = pymongo.MongoClient(arguments['--mongo-host'], arguments['--mongo-port'])
    db = YahooBackupDB(cli, arguments['<group_name>'])
    dest_root_dir = arguments['<root_dir>']

    if os.path.exists(dest_root_dir):
        sys.exit("Root site directory already exists. Specify a new directory or delete the existing one.")

    # -----------------
    # copy template site into the root dir
    P = os.path
    source_root_dir = P.join(P.dirname(__file__), 'static_site_template')

    # ignore the .html files in modules/ since we won't need them
    def ignore_copy(d, fs):
        if P.abspath(d) == P.abspath(P.join(source_root_dir, "modules")):
            return [f for f in fs if f.endswith(".html")]

        return []

    shutil.copytree(source_root_dir, dest_root_dir, ignore=ignore_copy)

    # -----------------
    # make the data subdirs
    data_dir = P.join(dest_root_dir, 'data')
    files_dir = P.join(data_dir, 'files')
    os.makedirs(data_dir)
    os.makedirs(files_dir)

    # -----------------
    # render the templates
    eprint("Rendering templates...")
    with open(P.join(dest_root_dir, 'modules', 'load-templates.js'), 'w') as f:
        cache_puts = []
        for fn in os.listdir(P.join(source_root_dir, 'modules')):
            if not fn.endswith(".html"):
                continue
            with open(P.join(source_root_dir, 'modules', fn), "r") as template_f:
                data = template_f.read()
            cache_puts.append(("./modules/%s" % fn, data))

        f.write("""\
'use strict';

angular
  .module('staticyahoo.app')

  .run(function ($templateCache) {
%s
  })

;
""" % "\n".join("""    $templateCache.put(%s, %s);""" % (json.dumps(fn), json.dumps(data)) for fn, data in cache_puts))

    # -----------------
    # render the data - helpers
    def dump_jsonp(filename, data):
        """Dump a JSON-serializable object to a file, in a format that the LocalJSONP factory on the
        static site expects."""
        with open(P.join(data_dir, filename), "w") as f:
            f.write("dataLoaded(%s);" % json.dumps(data, separators=',:'))

    def dump_jsonp_records(filename, records):
        """Same as `dump_jsonp`, except only works on lists of dicts, and stores them
        more efficiently."""
        # store all record keys as a set
        keys = set()
        for record in records:
            keys.update(record.keys())
        keys = sorted(list(keys))

        # write it all
        with open(P.join(data_dir, filename), "w") as f:
            f.write("""\
(function () {
    var keys = %s;
    var records = %s;
    var result = [];
    for (var i=0; i < records.length; i++) {
        var record = {};
        for (var j=0; j < keys.length; j++) {
            record[keys[j]] = records[i][j];
        }
        result.push(record);
    }
    dataLoaded(result);
})();""" % (
                json.dumps(keys, separators=',;'),
                json.dumps([[record.get(key) for key in keys] for record in records],
                           separators=',;'),
            ))

    # -----------------
    # render the config
    page_size = arguments['--msgdb-page-size']

    eprint("Rendering config file...")
    dump_jsonp('data.config.js', {
        'groupName': arguments['<group_name>'],
        'lastMessageTime': db.get_latest_message().get('postDate'),
        'messageDbPageSize': page_size,
        'cacheBuster': int(time.time()),
    })

    missing_ids = db.missing_message_ids()
    if missing_ids:
        eprint("")
        eprint("WARNING! Backup is not complete, missing %s messages! Site will be incomplete." % (
            len(missing_ids),
        ))
        eprint("")

    # -----------------
    # render the index
    eprint("Rendering index data...")
    dump_jsonp_records('data.index.js', [
        {
            "id": message['_id'],
            "subject": unescape_yahoo_html(message.get('subject', '')),
            "authorName": message.get('authorName', ''),
            "profile": message.get('profile', ''),
            "from": mask_email(message.get('from', '')),
            "timestamp": message.get('postDate', 0),
        }
        for message in db.yield_all_messages()
    ])

    # -----------------
    # render the messages
    failed_render_messages = set()

    def get_message_body(message):
        if message['_id'] < arguments['--redact-before']:
            return "<div class='alert alert-info text-center'>Redacted for testing.</div>"

        try:
            return html_from_message(message)
        except:
            failed_render_messages.add(message['_id'])
            return html_from_message(message, use_yahoo_on_fail=True)

    latest_id = db.get_latest_message()['_id']
    for start in range(0, latest_id+1, page_size):
        end = start + page_size
        eprint("Rendering messages %s to %s..." % (start, end))
        dump_jsonp_records('data.messageData-%s-%s.js' % (start, end), [
            {
                "id": message['_id'],
                "messageBody": get_message_body(message),
            }
            for message in db.yield_all_messages(start=start, end=end)
        ])

    # -----------------
    # dump the files
    def sanitize_filename(fn):
        return ''.join(c if (c.isalnum() or c in ' ._-') else '_' for c in fn)

    eprint("Dumping group files...")
    for ent, file_f in db.yield_all_files():
        if file_f is None:
            eprint("Skipping '%s', have no data for this file..." % (ent['_id'],))
            continue

        # split to pieces, ignore first empty piece, sanitize each piece, put back together
        sanitized = '/'.join(map(sanitize_filename, ent['_id'].split('/')[1:]))
        full_path = P.join(files_dir, sanitized)
        os.makedirs(P.dirname(full_path), exist_ok=True)
        with open(full_path, "wb") as f:
            for chunk in file_f:
                f.write(chunk)

    # -----------------
    # done
    eprint("Site is ready in '%s'!" % dest_root_dir)
    eprint("")
    eprint("NOTE: Failed to render the following messages from the raw email")
    eprint("data. They may not have rendered properly.")
    eprint("")
    eprint("[%s]" % ", ".join(map(str, sorted(failed_render_messages))))


def main():
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

    # set default login & password
    arguments.setdefault('--login', None)
    arguments.setdefault('--password', None)

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


if __name__ == "__main__":
    main()
