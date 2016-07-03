'use strict';

(function () {

  /**
   * Strip all the html elements out of the given html string.
   */
  var stripHtml = (function () {
    // re-use element creation
    var tmpEl = document.createElement("DIV");
    function strip(html) {
      if (!html) {
        return "";
      }

      tmpEl.innerHTML = html;
      return tmpEl.textContent || tmpEl.innerText || "";
    }
    return strip;
  }());

  angular.module('staticyahoo.core')

    .filter('htmlToPlaintext', function () {

      return function (text) {
        return stripHtml(text);
      };
    }
  );

})();
