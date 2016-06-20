'use strict';

angular.module('staticyahoo.nav', ['ui.bootstrap', 'ngRoute', 'route-segment', 'view-segment'])

  .config(function ($routeSegmentProvider, $routeProvider) {

    $routeSegmentProvider

      .when('/index', 'index')
      .when('/files', 'files')
      .when('/about', 'about')

      .segment('index', {
        templateUrl: './modules/index.html',
        controller: 'IndexCtrl'
      })

      .segment('files', {
        templateUrl: './modules/files.html'
      })

      .segment('about', {
        templateUrl: './modules/about.html'
      })

    ;

    $routeProvider.otherwise({redirectTo: 'index'});

  })

  .controller('NavCtrl', function ($scope) {

    $scope.collapsed = true;

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

/*  .run(function ($state) {
    // start at the index
    $state.go('index');
  }) */

;
