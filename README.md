# yahoo-groups-backup
A python script to backup the contents of Yahoo! groups, be they private or public.

## Setup/Requirements

The project requires Python 3.5+, Mongo, and a computer with a GUI as Selenium is used for the scraping (to be able to handle private groups).

[virtualenv](https://virtualenv.pypa.io/en/stable/) is recommended.

    git clone https://github.com/csaftoiu/yahoo-groups-backup.git
    cd yahoo-groups-backup
    pip install -r requirements.txt
    cp redactions.yaml.template redactions.yaml # edit this file if you want
    cp settings.yaml.template settings.yaml # definitely edit this file with your yahoo credentials

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

To see the full usage:

    ./yahoo-groups-backup.py -h
