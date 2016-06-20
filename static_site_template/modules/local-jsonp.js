'use strict';

angular.module('staticyahoo.local-jsonp', [])

  /**
   * Provide a function LocalJSONP(path) which loads the js file
   * at the given path and returns the data it contains.
   *
   * To work, the js file must result in calling a dataLoaded(data) function
   * with the data it wants to provide. This data is what is provided
   * to the returned promise.
   *
   * On error, the promise just never fires. Oops. Don't get files that
   * don't exist!
   */
  .factory('LocalJSONP', function ($q) {

    var cacheBuster = null;

    var state = {
      path: null,
      hook: null,
      promise: null
    };

    var dataLoaded = function (data) {
      if (!state.hook) {
        console.error("Data loaded without a hook!");
      }

      state.hook(data);
      state.hook = null;
    };

    /**
     * Load a (potentially) local JS file using the <script> tag trick.
     * The local file should be JavaScript code which calls dataLoaded() with the data.
     * `callback` will be called on success. The entire app will break on failure.
     */
    var loadLocalJS = function (path, callback) {
      state.hook = callback;

      var script = document.createElement('script');

      var src = path;
      if (cacheBuster) {
        src += '?cacheBuster=' + cacheBuster;
      }

      script.src = src;

      document.getElementsByTagName('head')[0].appendChild(script);
    };

    var LocalJSONP = function (path) {
      var deferred = $q.defer();

      if (state.promise) {
        console.log("Waiting for '" + state.path + "' to finish loading first...");

        state.promise.then(function (data) {
          console.log("Current path finished, now loading '" + path + "'...");
          LocalJSONP(path).then(function (data) {
            deferred.resolve(data);
            return data;
          });

          return data;
        });

        return deferred.promise;
      }

      loadLocalJS(path, function (data) {
        deferred.resolve(data);
      });

      // set current promise
      state.promise = deferred.promise;
      state.path = path;

      // clear current promise when data is loaded
      state.promise.then(function (data) {
        state.promise = null;
        state.path = null;
        return data;
      });

      return deferred.promise;
    };

    // add helpers so can hook into global window
    LocalJSONP._dataLoaded = dataLoaded;
    // add ability to set cache buster
    LocalJSONP.setCacheBuster = function (b) {
      cacheBuster = b;
    };

    return LocalJSONP;

  })

  .run(function ($window, LocalJSONP) {

    // set up the global function
    $window.dataLoaded = LocalJSONP._dataLoaded;

  })

;
