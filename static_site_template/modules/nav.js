'use strict';

angular.module('staticyahoo.nav', ['ui.router', 'staticyahoo.index'])

  .config(function ($locationProvider, $stateProvider, $urlRouterProvider) {

    $locationProvider.html5Mode(false);

    $stateProvider

      // only show/hide the message index
      .state('index', {
        onEnter: function ($rootScope) {
          $rootScope.showMessageIndex = true;
        },
        onExit: function ($rootScope) {
          $rootScope.showMessageIndex = false;
        },
        url: '/index'
      })

      .state('files', {
        templateUrl: './modules/files.html',
        url: '/files'
      })

      .state('about', {
        templateUrl: './modules/about.html',
        url: '/about'
      })

      .state('message', {
        templateUrl: './modules/message/message.html',
        url: '/message/:id',
        'controller': 'MessageCtrl'
      })

    ;

    $urlRouterProvider.otherwise(function ($injector) {
      $injector.get('$state').go('index');
    })

  })

  .controller('NavCtrl', function ($scope, $rootScope, $state) {

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

;
