'use strict';

angular.module('staticyahoo.message', ['staticyahoo.index'])

  .factory('MessageData', function ($rootScope, $q, LocalJSONP, IndexData) {

    var cache = {
      loading: false,
      promise: null,
      filename: null
    };

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
        idToData[data[i].i] = data[i];
      }

      return {
        data: data,
        idToData: idToData
      };
    };

    var getFileData = function (fn) {
      // if cache already has a file...
      if (cache.filename) {
        // if same file is loading/already in cache, return same promise
        if (cache.filename === fn) {
          console.log("Using cache for file '" + fn + "'");
          return cache.promise;
        }

        // if loading a different file, just load this one without caching it
        if (cache.loading) {
          console.log("Cache already loading file '" + cache.filename + "', not caching load of '" + fn + "'");
          var deferred = $q.defer();
          LocalJSONP(fn).then(function (data) {
            deferred.resolve(procFileData(data));
            return data;
          });
          return deferred.promise;
        }

        // otherwise overwrite it
        console.log("Overwriting cached file '" + cache.filename + "' with '" + fn + "'");
      }
      else {
        console.log("Loading first file to cache: '" + fn + "'");
      }

      var deferred = $q.defer();
      cache.loading = true;
      cache.filename = fn;
      cache.promise = deferred.promise;

      LocalJSONP(fn).then(function (data) {
        console.log("Loading '" + fn + "' into cache");
        cache.loading = false;

        deferred.resolve(procFileData(data));

        return data; // pass through data
      });

      return cache.promise;
    };

    return {
      /**
       * Get the message data for the message of the given id.
       * Return the promise which succeeds with combined index & message body data, or fails if
       * message was not found.
       */
      getMessageData: function (id) {
        var deferred = $q.defer();

        // wait until index data is loaded
        IndexData.promise.then(function (data) {
          var indexRow = IndexData.idToIndex[id];

          if (!indexRow) {
            console.log("Message " + id + " not found in index");
            deferred.reject();
            return data; // pass through data
          }

          getFileData(idToFilename(id)).then(function (msgData) {
            if (!msgData.idToData[id]) {
              console.log("Message " + id + " not found in message data");
              deferred.reject();
              return data; // pass through data
            }

            var result = {};
            angular.merge(result, indexRow);
            angular.merge(result, msgData.idToData[id]);
            deferred.resolve(result);

            return data; // pass through data
          });

          return data; // pass through data
        });

        return deferred.promise;
      }
    };

  })

  .controller('MessageCtrl', function ($rootScope, $scope, $state, $filter, $stateParams, $sce, MessageData) {
    console.log($stateParams.id);

    $scope.headers = [];
    $scope.message = {};

    MessageData.getMessageData($stateParams.id).then(function (msgData) {
      console.log(msgData);

      $scope.headers = [
        {name: "From", value: msgData.a},
        {name: "Date", value: $filter('date')(msgData.d * 1000, $rootScope.dateFormat)},
        {name: "Subject", value: msgData.s}
      ];
      $scope.message = {
        prev: msgData.p,
        next: msgData.n,
        prevUrl: $state.href('message', { id: msgData.p }),
        nextUrl: $state.href('message', { id: msgData.n }),
        prevMissing: msgData.i - msgData.p > 1 ? (msgData.i - msgData.p - 1) : 0,
        nextMissing: msgData.n - msgData.i > 1 ? (msgData.n - msgData.i - 1) : 0,
        id: msgData.i,
        messageBody: $sce.trustAsHtml(msgData.b)
      };
    });

  })

;
