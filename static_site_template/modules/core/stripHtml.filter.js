'use strict';

(function () {

  var stripHtml = (function () {
    // re-use element creation
    var tmpEl = document.createElement("DIV");
    function strip(html) {
      if (!html) {
        return "";
      }

      // replace a few things in the HTML to make the output nicer
      html = html.replace(/<br>/g, "\n");
      console.log(html);
      html = html.replace(/(<p>|<\/p>|<div>|<\/div>)/g, " ");

      tmpEl.innerHTML = html;
      return tmpEl.textContent || tmpEl.innerText || "";
    }
    return strip;
  }());

  angular.module('staticyahoo.core')

    .filter('htmlToPlaintext', function () {

      return function (text) {
        console.log(text);
        return stripHtml(text);
      };
    }
  );

})();
