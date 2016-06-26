'use strict';

angular.module('staticyahoo.message', ['ngSanitize', 'staticyahoo.index'])

  .factory('MessageData', function ($rootScope, $q, LocalJSONP, IndexData) {

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
      var deferred = $q.defer();
      cache.filename = fn;
      cache.promise = deferred.promise;
      LocalJSONP(fn).then(function (data) {
        deferred.resolve(procFileData(data));
        return data;
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
        if (typeof id === "string") {
          id = parseInt(id);
        }

        var deferred = $q.defer();

        // wait until index data is loaded
        IndexData.promise.then(function (data) {
          var indexRow = IndexData.lokiCollection.find({ id: id })[0];

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

  .controller('MessageCtrl', function (
      $rootScope, $scope, $state, $filter, $stateParams, $sce,
      MessageData, MessageIndex
  ) {
    var FROM = 0, DATE = 1, SUBJECT = 2, LINK = 3;
    $scope.headers = [];
    $scope.headers[FROM] = {name: "From", value: "..."};
    $scope.headers[DATE] = {name: "Date", value: "..."};
    $scope.headers[SUBJECT] = {name: "Subject", value: "..."};
    $scope.headers[LINK] = {name: "Link", value: "..."};

    $scope.message = {
      // we know the id
      id: $stateParams.id,
      // keep prev and next as the same value in case they accidentally click on it while something is loading
      prev: $stateParams.id,
      next: $stateParams.id,
      prevUrl: $state.href('message', { id: $stateParams.id }),
      nextUrl: $state.href('message', { id: $stateParams.id }),
      prevMissing: 0,
      nextMissing: 0
      // message body will be loading
    };

    $scope.loading = true;

    MessageData.getMessageData($stateParams.id).then(function (msgData) {
      $scope.loading = false;
      $scope.headers[FROM].value = MessageIndex.formatMessageAuthor(msgData, true);
      $scope.headers[DATE].value = $filter('date')(msgData.timestamp * 1000, $rootScope.dateFormat);
      $scope.headers[SUBJECT].value = msgData.subject;
      $scope.headers[LINK].value = $sce.trustAsHtml(
        '<a href="https://groups.yahoo.com/neo/groups/'
            + $rootScope.config.groupName + '/conversations/messages/' + msgData.id
        + '">' +
        'View this message on the live group' +
        '</a>');

      $scope.message = {
        id: msgData.id,
        prev: msgData.prevInTime,
        next: msgData.nextInTime,
        prevUrl: $state.href('message', { id: msgData.prevInTime }),
        nextUrl: $state.href('message', { id: msgData.nextInTime }),
        prevMissing: msgData.id - msgData.prevInTime > 1 ? (msgData.id - msgData.prevInTime - 1) : 0,
        nextMissing: msgData.nextInTime - msgData.id > 1 ? (msgData.nextInTime - msgData.id - 1) : 0,
        messageBody: $sce.trustAsHtml(msgData.messageBody)
      };
    });

  })

;
