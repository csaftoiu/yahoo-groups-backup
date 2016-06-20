'use strict';

angular
  .module('staticyahoo.app', [
    'staticyahoo.local-jsonp',
    'staticyahoo.nav',
    'staticyahoo.index',
  ])

  .run(function ($rootScope, LocalJSONP) {
    console.log("Angular app loaded!");

    // load the group config and stick it on the root scope
    LocalJSONP('./data/data.config.js').then(function (config) {
      $rootScope.config = config;

      console.log("Group name is: " + $rootScope.config.groupName);
    });
  })

;
