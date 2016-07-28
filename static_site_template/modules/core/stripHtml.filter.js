'use strict';

(function () {

  angular.module('staticyahoo.core')

    .filter('htmlToPlaintext', function () {

      return function (text) {
        return text.replace(/<[^>]+>/g, " ");
      };
    }
  );

})();
