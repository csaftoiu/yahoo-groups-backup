'use strict';

angular.module('staticyahoo.core')

  .factory('memoize', function () {
      return memoize;

      /**
       * A function called with another function which memoizes
       * up to the given number of results. Argument values are converted
       * to keys using .toString().
       * @param f The function to memoize
       * @param n Number of entries to keep. Defaults to keeping everything.
       * @returns {*} Memoized version of the function
       */
      function memoize(f, n) {
          var cache = {__size: 0};

          return function () {
              var key = "";
              for (var i = 0; i < arguments.length; i++) {
                  key += arguments[i].toString();
              }

              if (cache[key]) {
                  cache[key].lastAccess = Date.now();
                  return cache[key].value;
              }

              cache[key] = {};
              cache.__size++;
              cache[key].lastAccess = Date.now();
              cache[key].value = f.apply(this, arguments);

              if (n !== undefined && cache.__size > n) {
                  var earliest = null;
                  angular.forEach(cache, function (value, key) {
                      if (key === '__size') {
                          return;
                      }

                      if (!earliest || cache[key].lastAccess < cache[earliest].lastAccess) {
                          earliest = key;
                      }
                  });

                  console.log("Evicting '" + earliest + "'from cache");
                  delete cache[earliest];
                  cache.__size--;
              }

              return cache[key].value;
          };
      }
  })

;
