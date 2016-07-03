'use strict';

angular.module('staticyahoo.core')

  // from http://stackoverflow.com/questions/14462612/escape-html-text-in-an-angularjs-directive
  .filter('escapeHtml', function () {

    var entityMap = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': '&quot;',
      "'": '&#39;',
      "/": '&#x2F;'
    };

    return function(str) {
      return String(str).replace(/[&<>"'\/]/g, function (s) {
        return entityMap[s];
      });
    }
  })

;
