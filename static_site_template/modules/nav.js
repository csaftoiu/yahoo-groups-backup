'use strict';

angular.module('staticyahoo.nav', ['ui.router'])

  .config(function ($locationProvider, $stateProvider) {

    $locationProvider.html5Mode(false);

    $stateProvider

      .state('index', {
        templateUrl: './modules/index.html',
        controller: 'IndexCtrl'
      })

      .state('files', {
        onEnter: function ($window, $state, $rootScope, $timeout) {
          $window.open('./data/files', '_blank');
          // refresh back to the previous state
          var goBackTo = $state.current.name;
          $timeout(function () {
            $state.go(goBackTo);
          }, 0);
        }
      })

      .state('about', {
        templateUrl: './modules/about.html'
      })

    ;

  })

  .controller('NavCtrl', function ($scope, $state) {

    $scope.navs = [{
      segment: 'index',
      text: "Index"
    }, {
      segment: 'files',
      text: "Files"
    }, {
      segment: 'about',
      text: "About"
    }];

  })

  .run(function ($state) {
    // start at the index
    $state.go('index');
  })

;
