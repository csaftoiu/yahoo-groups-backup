import gridfs
import pymongo

from . import message


class YahooBackupDB:
    """Interface to store Yahoo! Group messages to a MongoDB. Group data is stored in a database
    whose name is the same as the group name. File data is stored in that database name plus `_gridfs`, where
    the gridfs _id is teh same as the file document _id, which is also the file path.

    The `messages` collection contains all the message data returned by the Yahoo! Groups API.
    Notable fields:
        * '_id' - the message id ('msgId' from the API)
        * 'authorName' - often empty, but may have a name
        * 'from' - sender's email address
        * 'profile' - profile name of the poster
        * 'subject' - the subject
        * 'postDate' - a timestamp of when the post was made
        * 'messageBody' - the message body, as formatted HTML
        * 'rawEmail' - the full raw email, with headers and everything
        * 'nextInTime' - next message id, in time order
        * 'nextInTopic' - next message id, in topic order
        * 'prevInTime' - prev message id, in time order
        * 'prevInTopic' - prev message id, in topic order
    If a message is missing, then the document will contain an `_id` field and nothing else.

    The `files` collection contains all the data about files:
        * `_id` - the full file path and name (unique)
        * `url` - the url the file was downloaded from
        * `mime` - file mimetype
        * `size` - file size as reported by yahoo - float, in kilobytes
        * `profile` - profile of user that posted the file
        * `date` - date listed on the Yahoo! Group for the file
    """
    def __init__(self, mongo_cli, group_name):
        self.group_name = group_name

        self.cli = mongo_cli
        self.db = getattr(self.cli, group_name)
        self.fs = gridfs.GridFS(getattr(self.cli, "%s_gridfs" % group_name))

        self._ensure_indices()

    def _ensure_indices(self):
        self.db.messages.create_index([("postDate", pymongo.ASCENDING)])
        self.db.messages.create_index([("authorName", pymongo.ASCENDING)])
        self.db.messages.create_index([("from", pymongo.ASCENDING)])
        self.db.messages.create_index([("profile", pymongo.ASCENDING)])

    def has_updated_message(self, message_number):
        """Return whether we already have the given message number loaded and fully updated."""
        query = self.db.messages.find({'_id': message_number})
        if not query.count():
            return False

        msg = query[0]
        if msg.get('nextInTime', None) == 0:
            # maybe need to update the 'next' link
            return False

        return True

    def upsert_message(self, message_number, message_obj):
        """Insert the message document, for the given message number. If the message is already stored, will
        update it. For a missing message, pass `None` for `message_obj`."""
        if not message_obj:
            self.db.messages.insert_one({'_id': message_number})
        else:
            assert message_number == message_obj['msgId']

            doc = {**message_obj, '_id': message_number}
            del doc['msgId']
            self.db.messages.update_one({'_id': message_number}, {'$set': doc}, upsert=True)

    def yield_all_messages(self, start=None, end=None):
        """Yield all existing messages (skipping missing ones), in reverse message_id order."""
        query = {'_id': {'$gte': start or 0, '$lt': end or 9999999999}}
        for msg in self.db.messages.find(query).sort('_id', -1):
            if not msg.get('messageBody'):
                continue

            yield msg

    def num_messages(self):
        """Return the number of non-empty messages in the database."""
        return self.db.messages.find({'messageBody': {'$exists': True}}).count()

    def get_latest_message(self):
        """Return the latest message."""
        return next(self.yield_all_messages())

    def missing_message_ids(self):
        """Return the set of the ids of all missing messages.."""
        latest = self.get_latest_message()
        ids = set(range(1, latest['_id']+1))
        present_ids = set(doc['_id'] for doc in self.db.messages.find({}, {'_id': 1}))
        return ids - present_ids

    # -- File operations

    def has_file_entry(self, filePath):
        return self.db.files.find({'_id': filePath}).count() > 0

    def has_file_data(self, filePath):
        return self.fs.exists({'_id': filePath})

    def upsert_file_entry(self, file_entry):
        doc = {**file_entry, '_id': file_entry['filePath']}
        del doc['filePath']
        self.db.files.update_one({'_id': doc['_id']}, {'$set': doc}, upsert=True)

    def update_file_data(self, file_path, data):
        if self.fs.exists({'_id': file_path}):
            self.fs.delete(file_path)

        self.fs.put(data, _id=file_path, filename=file_path)

    def yield_all_files(self):
        """Yield all (file_entry, grid_out_file) for all files in the database."""
        for entry in self.db.files.find():
            data = None
            if self.fs.exists({'_id': entry['_id']}):
                data = self.fs.get(entry['_id'])
            yield entry, data
