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
        templateUrl: './modules/files.html'
      })

      .state('about', {
        templateUrl: './modules/about.html'
      })

    ;

  })

  .controller('NavCtrl', function ($scope, $rootScope, $state) {

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
