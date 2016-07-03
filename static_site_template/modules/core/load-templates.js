'use strict';

angular
  .module('staticyahoo.core')

  .run(function ($window) {
    var error = "This is a placeholder; the static site must be viewed from a result of the dump_site command";
    $window.alert(error);
    throw new Error(error);
  })

;
