"""
Usage:
  yahoo-groups-backup.py dump_site [-h|--help] [options] <group_name> <root_dir>

Options:
  --msgdb-page-size=<page_size>    Number of messages to store in each local
                                   file. Larger means less files but each file
                                   is larger, while smaller means more files
                                   but each file is more manageable.
                                   [default: 500]
  --redact-before=<message_id>     Redact messages before this message number.
                                   Used to dump smaller sites for testing.
                                   [default: 0]
  --redactions=<file>              File to use for redactions, if exists.
                                   [default: redactions.yaml]
"""

import json
import os
import os.path as P
import shutil
import sys
import time

import pymongo
import schema
import yaml

from yahoo_groups_backup.logging import eprint
from yahoo_groups_backup import YahooBackupDB, html_from_message, unescape_yahoo_html, redaction


args_schema = schema.Schema({
    '--msgdb-page-size': schema.Use(int),
    '--redact-before': schema.Use(int),
    object: object,
})


def mask_email(email):
    if not email:
        return ''
    return email.rsplit("@", 1)[0] + "@...";


def splitall(path):
    """Split a path into a list of path components, e.g. 'a/b/c' --> ['a', 'b', 'c']."""
    d, f = P.split(path)
    if d == path: return [d]
    if f == path: return [f]
    return splitall(d) + [f]


def template_filename(path):
    """Given a path to a template file, e.g. 'foo/static_site_template/modules/index/index.html', return
    the template filename as angular expects it, e.g. './modules/index/index.html'."""
    parts = splitall(path)
    parts = ['.'] + parts[parts.index('modules'):]
    return '/'.join(parts)


def sanitize_filename(fn):
    return ''.join(c if (c.isalnum() or c in ' ._-') else '_' for c in fn)


class DumpSite:
    """Class to dump a static site.

    A class is used here to keep track of all the state as the dump progresses."""
    # templates used to render pages
    templates = {
        'load-templates.js': """\
'use strict';

angular
  .module('staticyahoo.core')

  .run(function ($templateCache) {
%s
  })

;
""",
        'redacted_message': "<div class='alert alert-info text-center'>Redacted for testing.</div>",
    }

    def __init__(self, arguments):
        self.group_name = arguments['<group_name>']
        self.page_size = arguments['--msgdb-page-size']
        self.redact_before = arguments['--redact-before']

        self.redactions = []
        if P.exists(arguments['--redactions']):
            self.redactions = redaction.load_redactions(open(arguments['--redactions']))
        elif arguments['--redactions'] != 'redactions.yaml':
            raise ValueError("Given non-existent redactions file")

        self.cli = pymongo.MongoClient(arguments['--mongo-host'], arguments['--mongo-port'])
        self.db = YahooBackupDB(self.cli, self.group_name)

        self.source_root_dir = P.join(P.dirname(__file__), '..', '..', 'static_site_template')
        self.dest_root_dir = arguments['<root_dir>']
        self.data_dir = P.join(self.dest_root_dir, 'data')
        self.files_dir = P.join(self.data_dir, 'files')

        self.failed_render_messages = set()

    def copy_template_site(self):
        """Copy the template site to the destination.

        Ignores the .html files in modules/ since they will be rendered directly into
        load-templates.js at a later step."""
        def ignore_copy(d, fs):
            if P.abspath(d) == P.abspath(P.join(self.source_root_dir, "modules")):
                return [f for f in fs if f.endswith(".html")]

            return []

        shutil.copytree(self.source_root_dir, self.dest_root_dir, ignore=ignore_copy)

    def render_templates(self):
        """Render the modules/**/*.html into the template Cache."""
        eprint("Rendering templates...")

        with open(P.join(self.dest_root_dir, 'modules', 'core', 'load-templates.js'), 'w') as f:
            cache_puts = []
            for dirpath, _, fns in os.walk(P.join(self.source_root_dir, 'modules')):
                for fn in fns:
                    if not fn.endswith(".html"):
                        continue
                    with open(P.join(dirpath, fn), "r") as template_f:
                        data = template_f.read()
                    cache_puts.append((template_filename(P.join(dirpath, fn)), data))

            f.write(self.templates['load-templates.js'] % (
                "\n".join(
                    """    $templateCache.put(%s, %s);""" % (json.dumps(fn), json.dumps(data))
                    for fn, data in cache_puts)
            ))

    def dump_jsonp(self, filename, data):
        """Dump a JSON-serializable object to a file, in a format that the LocalJSONP factory on the
        static site expects."""
        with open(P.join(self.data_dir, filename), "w") as f:
            f.write("dataLoaded(%s);" % json.dumps(data, separators=',:'))

    def dump_jsonp_records(self, filename, records):
        """Same as `dump_jsonp`, except only works on lists of dicts, and stores them
        more efficiently."""
        # store all record keys as a set
        keys = set()
        for record in records:
            keys.update(record.keys())
        keys = sorted(list(keys))

        # write it all
        with open(P.join(self.data_dir, filename), "w") as f:
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

    def render_config(self):
        """Render the site configuration file."""
        eprint("Rendering config file...")
        self.dump_jsonp('data.config.js', {
            'groupName': self.group_name,
            'lastMessageTime': self.db.get_latest_message().get('postDate'),
            'messageDbPageSize': self.page_size,
            'cacheBuster': int(time.time()),
        })

        missing_ids = self.db.missing_message_ids()
        if missing_ids:
            eprint("")
            eprint("WARNING! Backup is not complete, missing %s messages! Site will be incomplete." % (
                len(missing_ids),
            ))
            eprint("")

    def apply_redactions(self, text):
        """Apply the redactions to a given piece of text."""
        return self.redactions.apply(text)

    def render_index(self):
        """Render the index file."""
        eprint("Rendering index data...")
        self.dump_jsonp_records('data.index.js', [
            {
                "id": message['_id'],
                "subject": self.apply_redactions(unescape_yahoo_html(message.get('subject', '(unknown)'))),
                "authorName": self.apply_redactions(message.get('authorName', '')),
                "profile": self.apply_redactions(message.get('profile', '')),
                "from": self.apply_redactions(mask_email(message.get('from', ''))),
                "timestamp": message.get('postDate', 0),
            }
            for message in self.db.yield_all_messages(start=self.redact_before)
        ])

    def get_message_body(self, message):
        """Get a message body for a given message, without redactions."""
        if message['_id'] < self.redact_before:
            return self.templates['redacted_message']

        try:
            return html_from_message(message)
        except Exception:
            self.failed_render_messages.add(message['_id'])
            return html_from_message(message, use_yahoo_on_fail=True)

    def render_messages(self):
        """Render all the message bodies into the messageData data files."""
        latest_id = self.db.get_latest_message()['_id']
        for start in range(0, latest_id+1, self.page_size):
            end = start + self.page_size
            eprint("Rendering messages %s to %s..." % (start, end))
            self.dump_jsonp_records('data.messageData-%s-%s.js' % (start, end), [
                {
                    "id": message['_id'],
                    "messageBody": self.apply_redactions(self.get_message_body(message)),
                }
                for message in self.db.yield_all_messages(start=start, end=end)
            ])

    def dump_files(self):
        """Dump all the group files into the files directory."""
        eprint("Dumping group files...")
        for ent, file_f in self.db.yield_all_files():
            if file_f is None:
                eprint("Skipping '%s', have no data for this file..." % (ent['_id'],))
                continue

            # split to pieces, ignore first empty piece, sanitize each piece, put back together
            sanitized = '/'.join(map(sanitize_filename, ent['_id'].split('/')[1:]))
            full_path = P.join(self.files_dir, sanitized)
            os.makedirs(P.dirname(full_path), exist_ok=True)
            with open(full_path, "wb") as f:
                for chunk in file_f:
                    f.write(chunk)

    def run(self):
        """Run and dump the entire site."""
        if os.path.exists(self.dest_root_dir):
            sys.exit("Root site directory already exists. Specify a new directory or delete the existing one.")

        self.copy_template_site()

        os.makedirs(self.data_dir)
        os.makedirs(self.files_dir)

        self.render_templates()
        self.render_config()
        self.render_index()
        self.render_messages()
        self.dump_files()

        eprint("Site is ready in '%s'!" % self.dest_root_dir)
        if self.failed_render_messages:
            eprint("")
            eprint("NOTE: Failed to render the following messages from the raw email")
            eprint("data. They may not have rendered properly.")
            eprint("")
            eprint("[%s]" % ", ".join(map(str, sorted(self.failed_render_messages))))


def command(arguments):
    ds = DumpSite(arguments)
    ds.run()
