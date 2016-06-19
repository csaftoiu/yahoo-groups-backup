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

## Approach

### Scraping - Messages

Scraping is done with Selenium to allow for scraping private sites. 

The Yahoo Groups undocumented JSON API is used:

* `https://groups.yahoo.com/api/v1/groups/<group_name>/messages?count=1&sortOrder=desc&direction=-1`
to get the total number of messages.
* `https://groups.yahoo.com/api/v1/groups/<group_name>/messages/<message_number>` to 
get the data, with HTML content, for the given message
* `https://groups.yahoo.com/api/v1/groups/<group_name>/messages/<message_number>/raw` to 
get the data, with raw content, for the given message

All the message data from the API is combined and inserted into a mongo
database with the same name as the group. Data is stored as returned
from the API except the message id is stored into the `_id` field. 

### Scraping - Files

Files are scraped through the human-consumable interface (i.e. the website) 
as I couldn't figure out the JSON API calls for it. 

They are stored in a GridFS instance with the name `<group_name>_gridfs`.

### Static Site Dumping

All the group data - messages and files - can be dumped into a static
site which is viewable without any internet connection whatsoever, and
without needing to run a local browser.

The static site is a simple AngularJS app. The message index data is
stored as a separate .js file and loaded with "jsonp" (i.e. appending
a script tag to the document). This allows us to essentially load 
data from the local filesystem.

The messages themselves are stored in batches of 1000 messages and 
loaded on-demand. 

The app is a single-page app, which takes a few seconds to load if there
are a lot of messages, due to the index. However, once loaded, the 
index is retained in memory and browsing is smooth. 

A site is "dumped" by copying everything but the data from the
`static_site_template` directory, and rendering the data for the
particular group using Jinja2. 

The `static_site_template` directory contains the template for the
static site. `data` contains sample data from the 
[multiagent](https://groups.yahoo.com/neo/groups/multiagent/info)
 group. This is so the static site can be tested without having to
  dump it each time.

The group files are copied into the `files` directory, and it is left
up to the browser to display the contents, as if browsing any other
local directory.
