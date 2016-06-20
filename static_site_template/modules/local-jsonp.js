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

    var currentHook = null;

    var dataLoaded = function (data) {
      if (!currentHook) {
        console.error("Data loaded without a hook!");
      }

      currentHook(data);
      currentHook = null;
    };

    /**
     * Load a (potentially) local JS file using the <script> tag trick.
     * The local file should be JavaScript code which calls dataLoaded() with the data.
     * `callback` will be called on success. The entire app will break on failure.
     */
    var loadLocalJS = function (path, callback) {
      currentHook = callback;

      var script = document.createElement('script');
      script.src = path;
      document.getElementsByTagName('head')[0].appendChild(script);
    };

    var result = function (path) {
      var deferred = $q.defer();

      loadLocalJS(path, function (data) {
        deferred.resolve(data);
      });

      return deferred.promise;
    };

    // add helpers so can hook into global window
    result._dataLoaded = dataLoaded;

    return result;

  })

  .run(function ($window, LocalJSONP) {

    // set up the global function
    $window.dataLoaded = LocalJSONP._dataLoaded;

  })

;
