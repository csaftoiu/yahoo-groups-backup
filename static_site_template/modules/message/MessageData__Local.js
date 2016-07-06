'use strict';

angular.module('staticyahoo.message')

  .factory('LocalMessageDataSource', function ($rootScope, LocalJSONP) {
    var idToFilename = function (i) {
      var page = $rootScope.config.messageDbPageSize;

      var start = Math.floor(i / page) * page;
      var end = start + page;

      return './data/data.messageData-' + start + '-' + end + '.js';
    };

    var procFileData = function (data) {
      // map the data
      var idToData = {};
      for (var i=0; i < data.length; i++) {
        idToData[data[i].id] = data[i];
      }

      return {
        data: data,
        idToData: idToData
      };
    };

    var getFileData = function (fileName) {
      var cache = getFileData.cache = getFileData.cache || {__size: 0};

      // if cache already has this file, return the same promise
      if (cache[fileName]) {
        cache[fileName].lastAccess = Date.now();
        return cache[fileName].promise;
      }

      // otherwise, new promise and new file
      cache[fileName] = {};
      cache.__size++;
      cache[fileName].lastAccess = Date.now();
      cache[fileName].promise = LocalJSONP(fileName).then(function (data) {
        return procFileData(data);
      });

      // evict latest entry
      if (cache.__size > 10) {
        var earliest = null;
        angular.forEach(cache, function (value, key) {
          if (key === '__size') { return; }
          if (!earliest || cache[key].lastAccess < cache[earliest].lastAccess) {
            earliest = key;
          }
        });
        console.log("Evicting '" + earliest + "' from cache");
        delete cache[earliest];
        cache.__size--;
      }

      return cache[fileName].promise;
    };

    /**
     * Get just the message body.
     */
    var getMessageBody = function (id) {
      if (typeof id === "string") {
        id = parseInt(id);
      }

      return getFileData(idToFilename(id)).then(function (msgData) {
        if (!msgData.idToData[id]) {
          console.log("Message with id " + id + " not found in message data");
          return null;
        }

        return msgData.idToData[id].messageBody;
      });
    };

    return {
      getMessageBody: getMessageBody
    };
  })

  /**
   * Service for getting message data from the file system.
   */
  .factory('MessageData__Local', function ($q, IndexData, LocalMessageDataSource) {
    /**
     * Get the message data for the message of the given id.
     * Return the promise which succeeds with combined index & message body data, or fails if
     * message was not found.
     */
    var getMessageData = function (id) {
      if (typeof id === "string") {
        id = parseInt(id);
      }

      // we have to merge the data from the index data together with
      // the local message data

      return $q.all([
        IndexData.getRow(id),
        LocalMessageDataSource.getMessageBody(id)
      ]).then(function (vals) {
        var indexRow = vals[0];
        var msgBody = vals[1];

        if (!indexRow) {
          return null;
        }

        if (!msgBody) {
          throw new Error("Row exists, but missing message body?");
        }

        var result = {};
        angular.merge(result, indexRow);
        result.messageBody = msgBody;
        return result;
      });
    };

    return {
      getMessageData: getMessageData
    };

  })

;
