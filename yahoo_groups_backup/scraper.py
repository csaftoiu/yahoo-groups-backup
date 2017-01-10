import html
import json
import platform
import random
import re
import sys
import time
import urllib.parse

import dateutil.parser
from selenium.webdriver.common.keys import Keys
import splinter


def eprint(*args, **kwargs):
    return print(*args, **kwargs, file=sys.stderr)


class YahooBackupScraper:
    """Scrape Yahoo! Group messages with Selenium. Login information is required for
    private groups."""

    def __init__(self, group_name, driver, login_email=None, password=None, delay=1):
        self.group_name = group_name
        self.login_email = login_email
        self.password = password
        self.delay = delay

        self.br = splinter.Browser(driver)

    def __del__(self):
        self.br.quit()

    def _is_login_page(self):
        html = self.br.html
        return "Enter your email" in html and "Sign in" in html

    def _process_login_page(self):
        """Process the login page."""
        if not self.login_email or not self.password:
            raise ValueError("Detected private group! Login information is required")

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

    @staticmethod
    def _massage_message(data):
        """Given a msg, massage it so it's a bit more sensible."""
        # convert the timestamp to an integer, if possible
        try:
            data['postDate'] = int(data['postDate'])
        except (KeyError, ValueError, TypeError):
            eprint("Warning: got a non-int 'postDate' for message #%s: %s" % (
                data.get('msgId'), data.get('postDate')),
            )

        # 'profile' is sometimes missing (??)
        if 'profile' not in data:
            data['profile'] = None

        # parse out the from to keep only the email
        if '&lt;' in data['from'] or '&gt;'in data['from']:
            assert '&lt;' in data['from'] and '&gt;' in data['from']
            stripped_name, from_remainder = data['from'].split('&lt;', 1)
            stripped_name = stripped_name.strip()

            # make sure we're not losing any information
            if stripped_name.startswith("&quot;"):
                assert stripped_name.endswith("&quot;")
                stripped_name = stripped_name[6:-6].strip()

            # check that the stripped names match
            # but if we have a weird encoding thing then forget it
            # also sometimes the 'from' will not have the authorname, just an
            # email, in which case there's no information to be lost
            # examples of weird name: "Martin =?ISO-8859-1?Q?Ahnel=F6v?="
            if stripped_name and not ("=?" in stripped_name):
                if stripped_name.startswith("&quot;"):
                    assert stripped_name.endswith("&quot;")
                    stripped_name = stripped_name[6:-6].strip()

                check_authorname = data['authorName'].strip()
                # if we have an email, ignore the domain
                if '@' in stripped_name:
                    assert '@' in data['authorName']
                    stripped_name = stripped_name.split('@', 1)[0].strip()
                    check_authorname = check_authorname.split('@', 1)[0].strip()

                assert stripped_name == check_authorname.strip(), "Stripped name %s didn't match " \
                                                                  "author name %s (check name was %s)" % (
                        stripped_name, data['authorName'], check_authorname,
                    )

            # leave only the email in
            data['from'], leftover = from_remainder.split('&gt;', 1)
            # make sure lost nothing on the right side
            assert not leftover.strip()

        # replace no_reply with None for missing emails
        if data['from'] == 'no_reply@yahoogroups.com':
            data['from'] = None

        # authorName may have weird encoding - try to fix it
        match_hex = r"=([0-9a-f]{2})"
        if data['authorName'] and re.search(match_hex, data['authorName']):
            try:
                orig = data['authorName']
                as_ascii = orig.encode('ascii')
                subbed = re.sub(match_hex.encode('ascii'), lambda m: bytes([int(m.groups(1)[0], 16)]), as_ascii)
                data['authorName'] = subbed.decode('utf8')
                eprint("Interpreted '%s' as '%s'" % (orig, data['authorName']))
            except (UnicodeDecodeError, UnicodeEncodeError):
                eprint("Failed to interpret '%s' as equal-sign-plus-hex-encoded utf8" % repr(data['authorName']))
                # not a serious error, just continue

        return data

    def get_message(self, message_number):
        """Get the data for the given message number. Returns None if the message doesn't exist.
        Returns the object in the 'ygData' key returned by the Yahoo! Groups API,
        with both the HTML and the raw data in it."""
        # delay to prevent rate limiting
        time.sleep(max(0, random.gauss(self.delay, self.delay / 2)))
        url = "https://groups.yahoo.com/api/v1/groups/%s/messages/%s" % (self.group_name, message_number)

        formatted = self._load_json_url(url)
        if 'ygError' in formatted:
            if formatted['ygError']['httpStatus'] == 404:
                return None
            if formatted['ygError']['httpStatus'] == 500:
                eprint("Got unexpected server error, trying again...")
                return self.get_message(message_number)
            raise RuntimeError("Unexpected error:\n\n%s" % json.dumps(formatted))

        raw = self._load_json_url(url + "/raw")

        data = formatted['ygData']
        data['rawEmail'] = raw['ygData']['rawEmail']

        try:
            return self._massage_message(data)
        except:
            import pprint
            eprint("Failed to process message:\n%s" % (pprint.pformat(data)))
            raise

    def open_tab(self):
        if platform.system() == 'Darwin':
            key_sequence = Keys.COMMAND + 't'
        else:
            key_sequence = Keys.CONTROL + 't'

        self.br.driver.find_element_by_tag_name('body').send_keys(key_sequence)
        time.sleep(1)

    def close_tab(self):
        if platform.system() == 'Darwin':
            key_sequence = Keys.COMMAND + 'w'
        else:
            key_sequence = Keys.CONTROL + 'w'

        self.br.driver.find_element_by_tag_name('body').send_keys(key_sequence)
        time.sleep(1)

    def yield_walk_files(self, path="."):
        """Starting from `path`, yield a dict describing each file, and recurse into subdirectories."""
        url = "https://groups.yahoo.com/neo/groups/%s/files/%s/" % (self.group_name, path)

        self._visit_with_login(url)

        # get all elements with data-file - these are the file entries
        for el in self.br.find_by_xpath("//*[@data-file]"):
            # get the data
            data = el._element.get_attribute('data-file')
            # data is escaped; unescape it & interpret as JSON object
            data = json.loads('{' + data.encode('utf8').decode('unicode_escape') + '}')

            if data['fileType'] == 'd':
                # recur into subdirectory
                self.open_tab()
                yield from self.yield_walk_files(data['filePath'])
                self.close_tab()
            elif data['fileType'] == 'f':
                url = el.find_by_tag('a')[0]._element.get_attribute('href')
                profile = el._element.find_element_by_class_name('yg-list-auth').text
                date_str = el._element.find_element_by_class_name('yg-list-date').text
                the_date = dateutil.parser.parse(date_str)

                yield {
                    'filePath': urllib.parse.unquote(data['filePath']),
                    'url': url,
                    'mime': data['mime'],
                    'size': float(data['size']),
                    'profile': profile,
                    'date': the_date,
                }
            else:
                raise NotImplementedError("Unknown fileType %s, data was %s" % (
                    data['fileType'], json.dumps(data),
                ))
