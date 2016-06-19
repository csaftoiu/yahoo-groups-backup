'use strict';

angular.module('staticyahoo.nav', [])

  .controller('NavCtrl', function ($scope) {

    $scope.navs = [{
      segment: 'index',
      text: "Index"
    }, {
      segment: 'message',
      text: "Message"
    }, {
      segment: 'files',
      text: "Files"
    }];

  })

;