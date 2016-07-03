'use strict';

/** IMPORTANT:
 * DO NOT CHANGE THIS FILE OR MOVE IT!
 * It is hooked into in a very hard-coded manner by the Python dump site script!
 */

angular
  .module('staticyahoo.core')

  .run(function ($window) {
    var error = "This is a placeholder; the static site must be viewed from a result of the dump_site command";
    $window.alert(error);
    throw new Error(error);
  })

;
