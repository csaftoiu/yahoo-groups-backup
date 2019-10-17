# yahoo-groups-backup
A python script to backup the contents of Yahoo! groups, be they private or public.

## Setup/Requirements

You will need:
* Python 3.5+
* a MongoDB instance
* a computer with a GUI as Selenium is used for the scraping (to be able to handle private groups)
* a driver for Selenium to use with the browser ([Chromedriver](https://chromedriver.chromium.org/) is recommended as Firefox is no longer compatible with this script).

[pyenv](https://github.com/pyenv/pyenv) or [virtualenv](https://virtualenv.pypa.io/en/stable/) is recommended.

    git clone https://github.com/csaftoiu/yahoo-groups-backup.git
    cd yahoo-groups-backup
    pip install -r requirements.txt
    cp redactions.yaml.template redactions.yaml # edit this file if you want
    cp settings.yaml.template settings.yaml # definitely edit this file with your yahoo credentials

## Example

To scrape an entire site, say the `concatenative` group:

    ./yahoo-groups-backup.py scrape_messages --driver chrome concatenative

This will shove all the messages into a Mongo database (default `localhost:27017`), into the database of the same name as the group.

To scrape the files as well (though this group has no files):

    ./yahoo-groups-backup.py scrape_files --driver chrome concatenative

To dump the scraped messages as a human-friendly, fully static (i.e. viewable from the file system) website:

    ./yahoo-groups-backup.py dump_site concatenative concatenative_static_site

Then simply open `concatenative_static_site/index.html` and browse!

## Full Usage

To see the full usage:

    ./yahoo-groups-backup.py -h
    
## I'm getting some weird error

Older versions of Selenium might be troublesome. Try:

    pip install -U selenium
