'use strict';

angular.module('staticyahoo.message')

  .controller('MessageCtrl', function (
      $rootScope, $scope, $state, $filter, $stateParams, $sce,
      MessageData
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
        $scope.headers[FROM].value = $filter('messageAuthor')(msgData, true);
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
