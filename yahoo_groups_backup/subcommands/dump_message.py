"""
Usage:
  yahoo-groups-backup.py dump_message [-h|--help] <group_name> <message_id>

Help:
  This dumps the message of the particular id from the given group.
"""
import pymongo
import schema

from yahoo_groups_backup import YahooBackupDB, html_from_message
from yahoo_groups_backup.logging import eprint


args_schema = schema.Schema({
    '<message_id>': schema.Use(int),
    object: object,
})


def command(arguments):
    cli = pymongo.MongoClient(arguments['--mongo-host'], arguments['--mongo-port'])
    ydb = YahooBackupDB(cli, arguments['<group_name>'])

    msg = ydb.db.messages.find_one({'_id': arguments['<message_id>']})

    fn = '#%d from %s.html' % (msg['_id'], msg['profile'])

    eprint("Dumping message to '%s'..." % fn)

    with open(fn, 'w', encoding='utf8') as f:
        f.write("""\
<head>
<meta charset="UTF-8">
</head>
<body>

<div class="subject">%s</div>
<div class="body">%s</div>

</body>""" % (msg.get('subject', '(unknown)'), html_from_message(msg, True)))

