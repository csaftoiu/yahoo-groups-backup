#!/usr/bin/env python
import json
import os
import sys
import time

import splinter
import yaml


def eprint(*args, **kwargs):
    return print(*args, **kwargs, file=sys.stderr)


class YahooBackup:
    def __init__(self, group_name, login_email=None, password=None):
        self.group_name = group_name
        self.login_email = login_email
        self.password = password

        self.br = splinter.Browser()

    def __del__(self):
        self.br.quit()

    def _is_login_page(self):
        html = self.br.html
        return "Enter your email" in html and "Sign in" in html

    def _process_login_page(self):
        """Process the login page."""
        eprint("Processing the log-in page...")

        # email ...
        self.br.fill("username", self.login_email)
        time.sleep(1)
        self.br.find_by_name("signin").click()
        # Wait ...
        time.sleep(2)

        # password ...
        self.br.fill("passwd", self.password)
        time.sleep(1)
        self.br.find_by_name("signin").click()
        # Wait ...
        time.sleep(2)

    def _visit_with_login(self, url):
        """Visit the given URL. Logs in if necessary."""
        self.br.visit(url)

        if self._is_login_page():
            self._process_login_page()
            # get the page again
            self.br.visit(url)

        if self._is_login_page():
            raise RuntimeError("Unable to login")

        return

    def _load_json_url(self, url):
        """Given a URL which returns a JSON response, return the loaded object. A bit hacky to deal with
        Selenium wrapping the JSON in <html>...<body><pre>...</pre></body></html>."""
        self._visit_with_login(url)
        return json.loads(self.br.find_by_tag("pre")[0].text)

    def get_last_message_number(self):
        """Return the latest message number in the group."""
        url = "https://groups.yahoo.com/api/v1/groups/%s/messages?count=1&sortOrder=desc&direction=-1" % (
            self.group_name,
        )
        return self._load_json_url(url)['ygData']['messages'][0]['messageId']

    def get_message(self, message_number):
        """Get the data for the given message number. Returns None if the message doesn't exist.
        Returns the object in the 'ygData' key returned by the Yahoo! Groups API,
        with both the HTML and the raw data in it."""
        eprint("Getting message #%s..." % (message_number,))
        url = "https://groups.yahoo.com/api/v1/groups/%s/messages/%s" % (self.group_name, message_number)

        formatted = self._load_json_url(url)
        if 'ygError' in formatted:
            if formatted['ygError']['httpStatus'] == 404:
                return None
            raise RuntimeError("Unexpected error:\n\n%s" % json.dumps(formatted))

        raw = self._load_json_url(url + "/raw")

        data = formatted['ygData']
        data['rawEmail'] = raw['ygData']['rawEmail']
        return data


if __name__ == "__main__":
    if not os.path.exists("settings.yaml"):
        eprint("settings.yaml file is missing. Try `cp settings.yaml.template settings.yaml`.")
        sys.exit(1)

    settings = yaml.load(open("settings.yaml"))

    yaba = YahooBackup("actualfreedom", settings['login_email'], settings['password'])

    last_message = yaba.get_last_message_number()
    cur_message = last_message
    while cur_message >= 1:
        import pprint
        pprint.pprint(yaba.get_message(cur_message))
        cur_message -= 1
