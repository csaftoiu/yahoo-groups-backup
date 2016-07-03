'use strict';

angular.module('staticyahoo.message', ['staticyahoo.index'])

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

      return $q.all([IndexData.getRow(id), getFileData(idToFilename(id))]).then(function (vals) {
        var indexRow = vals[0];
        var msgData = vals[1];

        if (!indexRow) {
          console.log("Message with id " + id + " does not exist");
          return null;
        }

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

  .controller('MessageCtrl', function (
      $rootScope, $scope, $state, $filter, $stateParams, $sce,
      MessageData, MessageIndex
  ) {
    var FROM = 0, DATE = 1, SUBJECT = 2, LINK = 3;
    $scope.headers = [];
    $scope.headers[FROM] = {name: "From", value: "..."};
    $scope.headers[DATE] = {name: "Date", value: "..."};
    $scope.headers[SUBJECT] = {name: "Subject", value: "..."};

    $scope.message = {
      // we know the id
      id: $stateParams.id,
      // keep prev and next as the same value in case they accidentally click on it while something is loading
      // better than setting it to +1/-1 since then they may end up on a message that doesn't exist
      prev: $stateParams.id,
      next: $stateParams.id,
      missing: false
    };

    $scope.prevUrl = function () {
      return $state.href('message', { id: $scope.message.prev });
    };
    $scope.nextUrl = function () {
      return $state.href('message', { id: $scope.message.next });
    };
    $scope.prevMissing = function () {
      var m = $scope.message;
      return m.id - m.prev > 1 ? (m.id - m.prev - 1) : 0;
    };
    $scope.nextMissing = function () {
      var m = $scope.message;
      return m.next - m.id > 1 ? (m.next - m.id - 1) : 0;
    };

    $scope.loading = true;

    MessageData.getMessageData($stateParams.id).then(function (msgData) {
      $scope.loading = false;

      if (msgData) {
        $scope.headers[FROM].value = MessageIndex.formatMessageAuthor(msgData, true);
        $scope.headers[DATE].value = $filter('date')(msgData.timestamp * 1000, $rootScope.dateFormat);
        $scope.headers[SUBJECT].value = msgData.subject;

        $scope.message = {
          id: msgData.id,
          prev: msgData.prevInTime,
          next: msgData.nextInTime,
          messageBody: $sce.trustAsHtml(msgData.messageBody),
          missing: false
        };
      } else {
        $scope.message = {
          id: $stateParams.id,
          prev: +$stateParams.id - 1,
          next: +$stateParams.id + 1,
          missing: true
        };
      }
    }, function () {
      // failed due to network error or something? donno what to do here
      $scope.loading = false;
      $scope.error = true;
      $scope.message = {
        id: $stateParams.id,
        prev: +$stateParams.id - 1,
        next: +$stateParams.id + 1
      };
    });

  })

;
