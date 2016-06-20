'use strict';

angular
  .module('staticyahoo.app', [
    'staticyahoo.local-jsonp',
    'staticyahoo.nav',
    'staticyahoo.index',
    'staticyahoo.message',
    'ui.bootstrap'
  ])

  .run(function ($rootScope, LocalJSONP) {
    $rootScope.dateFormat = 'MMM d, y h:mm a';

    $rootScope.configLoaded = false;
    console.log("Angular app loaded!");

    // load the group config and stick it on the root scope
    LocalJSONP('./data/data.config.js').then(function (config) {
      $rootScope.config = config;

      console.log("Config loaded. Group name is: " + $rootScope.config.groupName);
      $rootScope.configLoaded = true;
    });
  })

;
