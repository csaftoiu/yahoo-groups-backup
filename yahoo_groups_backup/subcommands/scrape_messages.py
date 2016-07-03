"""
Usage:
  yahoo-groups-backup.py scrape_messages [-h|--help] [options] <group_name>

Options:
  -d --delay=<delay>       Delay before scraping each message, to avoid rate
                           limiting. Delays by a gaussian distribution with
                           average <delay> and standard deviation <delay>/2.
                           [default: 1]
  --login=<login>          Yahoo! login, required for private groups.
  --password=<password>    Yahoo! password, required for private groups.
  --driver=<driver>        Specify a webdriver for Selenium [default: firefox]
"""
import pymongo
import schema

from yahoo_groups_backup import YahooBackupDB, YahooBackupScraper
from yahoo_groups_backup.logging import eprint


args_schema = schema.Schema({
    '--delay': schema.And(schema.Use(float), lambda n: n > 0, error='Invalid delay, must be number > 0'),
    object: object,
})


def command(arguments):
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
