'use strict';

angular.module('staticyahoo.message')

  .filter('messageAuthor', function () {
    return function (row, includeEmail) {
      includeEmail = includeEmail || false;

      var res;

      if (row.authorName && row.profile) {
        if (row.authorName === row.profile) {
          res = row.authorName;
        } else {
          res =row.authorName + " (" + row.profile + ")";
        }
      }
      else if (row.authorName) {
        res = row.authorName;
      }
      else if (row.profile) {
        res = row.profile;
      }
      else if (row.from) {
        return row.from;
      }
      else {
        res = "???";
      }

      if (includeEmail && row.from) {
        res += " <" + row.from + ">";
      }

      return res;
    };
  })

;
