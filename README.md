# yahoo-groups-backup
A python script to backup the contents of Yahoo! groups, be they private or public.

## Example

To scrape an entire site, say the `concatenative` group:

    ./yahoo-groups-backup.py scrape_all concatenative

This will use Selenium to scrape the entire group and shove all the messages into a Mongo database of the same name as the group.

To dump the site as a human-friendly, fully static (i.e. viewable from the file system) website:

    ./yahoo-groups-backup.py dump_site concatenative concatenative_static_site

Then simply open `concatenative_static_site/index.html` and browse!

## Full Usage
```
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
``
