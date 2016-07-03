'use strict';

angular.module('staticyahoo.message')

  /**
   * Service for getting message data from the file system.
   */
  .factory('MessageData__Local', function ($rootScope, $q, LocalJSONP, IndexData) {
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

    var getFileData = function (fn) {
      var cache = getFileData.cache = getFileData.cache || {};

      // if cache already has this file, return the same promise
      if (cache.filename === fn) {
        return cache.promise;
      }

      // otherwise, new promise and new file
      cache.filename = fn;
      cache.promise = LocalJSONP(fn).then(function (data) {
        return procFileData(data);
      });

      return cache.promise;
    };

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
        getFileData(idToFilename(id))
      ]).then(function (vals) {
        var indexRow = vals[0];
        var msgData = vals[1];

        if (!indexRow) {
          console.log("Message with id " + id + " does not exist");
          return null;
        }

        // get the particular message we need
        if (!msgData.idToData[id]) {
          console.log("Message with id " + id + " not found in message data");
          return null;
        }

        var result = {};
        angular.merge(result, indexRow);
        angular.merge(result, msgData.idToData[id]);
        return result;
      });
    };

    return {
      getMessageData: getMessageData
    };

  })

;
