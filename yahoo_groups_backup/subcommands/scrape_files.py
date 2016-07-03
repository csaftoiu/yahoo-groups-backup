"""
Usage:
  yahoo-groups-backup.py scrape_files [-h|--help] [options] <group_name>

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
import requests

from yahoo_groups_backup import YahooBackupDB, YahooBackupScraper
from yahoo_groups_backup.logging import eprint


def command(arguments):
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
