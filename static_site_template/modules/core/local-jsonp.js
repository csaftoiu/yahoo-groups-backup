'use strict';

angular.module('staticyahoo.core')

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
      promise: null,
      script: null
    };

    var dataLoaded = function (data) {
      if (!state.script) {
        console.error("Data loaded without a script tag!");
      }
      else {
        document.getElementsByTagName('head')[0].removeChild(state.script);
        state.script = null;
      }

      if (!state.hook) {
        console.error("Data loaded without a hook!");
      }
      else {
        state.hook(data);
        state.hook = null;
      }
    };

    /**
     * Load a (potentially) local JS file using the <script> tag trick.
     * The local file should be JavaScript code which calls dataLoaded() with the data.
     * `callback` will be called on success. The entire app will break on failure.
     */
    var loadLocalJS = function (path, callback) {
      state.hook = callback;

      var script = document.createElement('script');

      state.script = script;

      var src = path;
      if (cacheBuster) {
        src += '?cacheBuster=' + cacheBuster;
      }

      script.src = src;

      document.getElementsByTagName('head')[0].appendChild(script);
    };

    var LocalJSONP = function (path) {
      if (state.promise) {
        console.log("Waiting for '" + state.path + "' to finish loading first...");

        return state.promise.then(function () {
          console.log("Current path finished, now loading '" + path + "'...");
          return LocalJSONP(path);
        });
      }

      var promise = $q(function (resolve, reject) {
        loadLocalJS(path, function (data) {
          resolve(data);
        });
      });

      // set current promise
      state.promise = promise;
      state.path = path;

      // clear current promise when data is loaded
      state.promise.then(function () {
        state.promise = null;
        state.path = null;
      });

      return promise;
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
