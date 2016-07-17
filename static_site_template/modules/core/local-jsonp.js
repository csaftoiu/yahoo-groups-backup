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
  .factory('LocalJSONP', function ($q, $promiseForEach) {

    var cacheBuster = null;

    var state = {
      path: null,
      hook: null,
      promise: null,
      script: null
    };

    LocalJSONP.setCacheBuster = function (b) {
      cacheBuster = b;
    };
    LocalJSONP.loadCompressed = loadCompressed;
    // add ref so can hook into global dataLoaded
    LocalJSONP._dataLoaded = dataLoaded;

    return LocalJSONP;

    // ---------------------------------------------

    /**
     * Internal callback for when data is loaded.
     */
    function dataLoaded(data) {
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
    }

    /**
     * Load a (potentially) local JS file using the <script> tag trick.
     * The local file should be JavaScript code which calls dataLoaded() with the data.
     * `callback` will be called on success. The entire app will break on failure.
     */
    function loadLocalJS(path, callback) {
      state.hook = callback;

      var script = document.createElement('script');

      state.script = script;

      var src = path;
      if (cacheBuster) {
        src += '?cacheBuster=' + cacheBuster;
      }

      script.src = src;

      document.getElementsByTagName('head')[0].appendChild(script);
    }

    /**
     * Load the contents of the LocalJSONP file found at path.
     */
    function LocalJSONP(path) {
      if (state.promise) {
        console.log("JSONP: WAITING '" + path + "'");

        return state.promise.then(function () {
          return LocalJSONP(path);
        });
      }

      console.log("JSONP: LOADING '" + path + "'");
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
    }

    /**
     * Load the compressed object starting at the given prefix.
     * For example, given prefix some/dir/object, it will load
     *
     *     some/dir/object-part0.lz-b64.js
     *
     * It will then use this to load as many parts as necessary.
     *
     * All parts are uncompressed, stuck together, and
     * JSON.parse()d, then the object is returned.
     *
     * @param prefix The prefix path
     * @param progress= Callback, called with (stepsDone, totalSteps) whenever
     * another step is processed. For each chunk, a step is:
     *    1. Loading compressed data from the filesystem
     *    2. Decompressing it
     *
     * And finally, parsing the JSON at the end is another step.
     * So there are `2 * chunks + 1` steps
     * @return A promise firing with the object.
     */
    function loadCompressed(prefix, progress) {
      progress = progress || function () {};

      var totalChunks = null;

      var chunks = [];

      var processPart = function(i) {
        return LocalJSONP(prefix + '-part' + i + '.lz-b64.js').then(function (chunkInfo) {
          totalChunks = chunkInfo.totalChunks;

          progress(i*2, totalChunks*2 + 1);

          var chunk = LZString.decompressFromBase64(chunkInfo.chunkData);
          chunks[i] = chunk;

          progress(i*2 + 1, totalChunks*2 + 1);
        });
      };

      // load first part to get total chunks, then load the remaining parts
      return processPart(0).then(function () {
        var partIs = [];
        for (var i=1; i < totalChunks; i++) {
          partIs.push(i);
        }
        return $promiseForEach(partIs, processPart);
      }).then(function () {
        var obj = JSON.parse(chunks.join(""));
        if (!obj) {
          throw new Error("object should have been parsed");
        }

        // mark final progress done
        progress(totalChunks*2 + 1, totalChunks*2 + 1);

        return obj;
      });
    }

  })

  .run(function ($window, LocalJSONP) {

    // set up the global function
    $window.dataLoaded = LocalJSONP._dataLoaded;

  })

;
