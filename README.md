# yahoo-groups-backup
A python script to backup the contents of Yahoo! groups, be they private or public.

## Setup/Requirements

The project requires Python 3, Mongo, and a computer with a GUI as Selenium is used for the scraping (to be able to handle private groups).

[virtualenv](https://virtualenv.pypa.io/en/stable/) is recommended.

    git clone https://github.com/csaftoiu/yahoo-groups-backup.git
    cd yahoo-groups-backup
    pip install -r requirements.txt

## Example

To scrape an entire site, say the `concatenative` group:

    ./yahoo-groups-backup.py scrape_messages concatenative

This will shove all the messages into a Mongo database (default `localhost:27017`), into the database of the same name as the group.

To scrape the files as well (though this group has no files):

    ./yahoo-groups-backup.py scrape_files concatenative

To dump the site as a human-friendly, fully static (i.e. viewable from the file system) website:

    ./yahoo-groups-backup.py dump_site concatenative concatenative_static_site

Then simply open `concatenative_static_site/index.html` and browse!

## Full Usage
```
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

```
