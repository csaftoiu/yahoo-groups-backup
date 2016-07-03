import email
import html
import sys
import traceback


def eprint(*args, **kwargs):
    print(*args, **kwargs, file=sys.stderr)


def unescape_yahoo_html(s):
    """Unescape the html transforms that Yahoo! did on the message.

    This applies to message bodies and subjects."""
    return s\
        .replace('&lt;', '<')\
        .replace('&gt;', '>')\
        .replace('&#39;', "'")\
        .replace('&quot;', '"')\
        .replace('&amp;', '&')


def message_charset(msg):
    """Return an email.message.Message's charset."""
    if msg.get_charset():
        return msg.get_charset()

    for key, val in msg.get_params():
        if key == 'charset':
            return val

    raise ValueError("Can't get charset from msg")


def is_raw_email_truncated(raw_email_str):
    """Return whether the raw email is truncated."""
    return "(Message over 64 KB, truncated)" in raw_email_str


def html_from_email_message(msg):
    """Given an email.message.Message instance, return the HTML best suited to displaying
    the message.
    :param msg: The message instance to process
    """
    # for 'alternative', return the latest one
    if msg.is_multipart():
        if msg.get_content_subtype() == 'alternative':
            return html_from_email_message(msg.get_payload()[-1])

        raise NotImplementedError("Can't parse multipart message with subtype '%s'" % (
            msg.get_content_subtype(),
        ))

    raw_bytes = msg.get_payload(decode=True)

    charset = message_charset(msg)
    body_string = raw_bytes.decode(charset)

    if msg.get_content_subtype() == 'html':
        # we have HTML already
        html_string = body_string
        return html_string

    if msg.get_content_subtype() == 'plain':
        # render plain text in reasonable-looking HTML
        html_string = html.escape(body_string).replace("\n", "<br>")
        return html_string

    raise NotImplementedError("Don't know how to handle message of type %s" % (
        msg.get_content_type(),
    ))


def html_from_yahoo_raw_email(raw_email_str):
    """Given a raw email string from yahoo's `rawEmail` key, parse out and return the most suitable message body
    string, as HTML suitable to be displayed.

    :param raw_email_str: The raw email string, as gotten from Yahoo! groups
    :raises ValueError: If passed in a truncated message
    :returns HTML to be displayed.
    """
    # first, undo the transformations yahoo! did
    # this required some fun reverse-engineering...
    raw_email_str = unescape_yahoo_html(raw_email_str)

    # Yahoo! decides to truncate the raw messages at *any* point in the
    # email... nice work
    is_truncated = is_raw_email_truncated(raw_email_str)
    if is_truncated:
        raise ValueError("Shouldn't try to handle Yahoo!'s truncated messages")

    # now handle it as a string
    return html_from_email_message(email.message_from_string(raw_email_str))


def html_from_message(message, use_yahoo_on_fail=False):
    """Given the message record, return the best HTML we can get from it."""
    assert 'messageBody' in message

    if is_raw_email_truncated(message['rawEmail']):
        # return Yahoo's rendering, since it is less truncated
        return message['messageBody']

    # otherwise, try to render it ourselves
    try:
        result = html_from_yahoo_raw_email(message['rawEmail'])

        # Yahoo! strips out attachments, so if the sender sent their email as
        # an attachment, it won't be available in the raw email. In this case,
        # use Yahoo!'s rendering.
        if 'Attachment content not displayed' in result:
            return message['messageBody']

        return result
    except Exception:
        if use_yahoo_on_fail:
            eprint("Failed to process raw email from Yahoo! message:")
            traceback.print_exc(file=sys.stderr)
            eprint("Falling back on Yahoo!'s rendering")
            return message['messageBody']

        # otherwise re-raise it
        raise
