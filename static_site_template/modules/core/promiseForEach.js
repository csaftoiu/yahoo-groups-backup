'use strict';

angular.module('staticyahoo.core')

  .factory('$promiseForEach', function ($q) {

    /**
     * Given an array of values, and a function which takes a value and
     * returns a promise, chain the promises, calling the function one
     * by one as each previous step finishes. Returns a promise which
     * resolves when the last step is done.
     *
     * Does this efficiently, i.e. not by creating the entire promise
     * chain up-front.
     */
    return function (arr, f) {
      var i = 0;

      var next = function () {
        if (i >= arr.length) {
          return;
        }

        var nextP = $q.when(f(arr[i], i));
        i++;
        return nextP.then(next);
      };

      return $q.resolve().then(next);
    };

  })

  .factory('$promiseChainMap', function ($q) {

    /**
     * Given an array of values, and a function which takes a value and
     * returns a promise, chain the promises, calling the function one
     * by one as each previous step finishes. Keeps track of return values.
     * Returns a promise which resolves when the last step is done, which
     * fires with the array of return values.
     *
     * Does this efficiently, i.e. not by creating the entire promise
     * chain up-front.
     */
    return function (arr, f) {
      var i = 0;
      var results = [];

      var next = function () {
        if (i >= arr.length) {
          return results;
        }

        return $q.when(f(arr[i], i)).then(function (val) {
          results[i] = val;
          i++;
          return next();
        });
      };

      return $q.resolve().then(next);
    };

  })

;
