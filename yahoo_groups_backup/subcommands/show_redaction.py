"""
Usage:
  yahoo-groups-backup.py show_redaction [-h|--help] [options] <group_name> <source> <redaction>

Help:
  This shows what the result would be of redacting a source string to a
  particular destination string. It shows the surrounding ~35 characters or
  so on each side, removing duplicates and sorting by frequency.

      <source>               The source string to redact, e.g. "Johnson"
      <redaction>            What to redact the source to, e.g. "J"

Options:
    -i --case-insensitive    Case-insensitive redactions
"""
import pymongo
import re

from yahoo_groups_backup import YahooBackupDB, html_from_message


def command(arguments):
    cli = pymongo.MongoClient(arguments['--mongo-host'], arguments['--mongo-port'])
    ydb = YahooBackupDB(cli, arguments['<group_name>'])

    src = arguments['<source>']
    repl = arguments['<redaction>']

    seen = set()

    flags = None
    if arguments['--case-insensitive']:
        flags = re.IGNORECASE

    def process_redaction(messageId, text):
        if not text:
            return

        if len(text) < 30:
            if text in seen:
                return
            seen.add(text)

        for match in re.finditer(re.escape(src), text, flags=flags):
            start, end = match.span()

            orig_start = max(0, start - 30)
            orig_end = min(len(text), start + len(src) + 30)

            redacted = (text[:start] + repl + text[end:])
            show_start = max(0, start - 30)
            show_end = min(len(redacted), start + len(repl) + 30)
            print("----- In #%d -----" % (messageId,))
            print("Before: %s" % text[orig_start:orig_end])
            print("After:  %s" % redacted[show_start:show_end])

    for i, msg in enumerate(ydb.yield_all_messages()):
        if i % 1000 == 0:
            print("Up to #%d..." % msg['_id'])

        process_redaction(msg['_id'], html_from_message(msg, True))
        process_redaction(msg['_id'], msg.get('subject', ''))
        process_redaction(msg['_id'], msg.get('authorName', ''))
        process_redaction(msg['_id'], msg.get('from', ''))
        process_redaction(msg['_id'], msg.get('profile', ''))
