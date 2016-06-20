'use strict';

angular
  .module('staticyahoo.app', [
    'staticyahoo.nav',
    'staticyahoo.index'
  ])

  .run(function ($rootScope) {
    console.log("Angular app loaded!");
  })

;
