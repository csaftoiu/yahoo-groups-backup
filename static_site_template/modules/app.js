'use strict';

angular
  .module('staticyahoo.app', [
    'staticyahoo.nav'
  ])

  .run(function () {
    console.log("Angular app loaded!");
  })

;
