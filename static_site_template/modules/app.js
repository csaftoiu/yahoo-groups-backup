'use strict';

angular
  .module('staticyahoo.app', [
    'LocalStorageModule',
    'ui.bootstrap',
    'ui.bootstrap-slider',
    'staticyahoo.core',
    'staticyahoo.nav',
    'staticyahoo.index',
    'staticyahoo.message'
  ])

  .run(function ($rootScope, LocalJSONP) {
    $rootScope.dateFormat = 'MMM d, y h:mm a';

    $rootScope.configLoaded = false;
    console.log("Angular app loaded!");

    // load the group config and stick it on the root scope
    // always bust cache for initial config
    LocalJSONP.setCacheBuster(Math.round(new Date().getTime()/1000));
    LocalJSONP('./data/data.config.js').then(function (config) {
      $rootScope.config = config;

      console.log("Config loaded. Group name is: " + $rootScope.config.groupName);
      $rootScope.configLoaded = true;
      // now set cache buster for the entire site - if it didn't change since last usage, then
      // the whole site can be cached.
      LocalJSONP.setCacheBuster(config.cacheBuster);
    });
  })

;
