'use strict';

angular.module('staticyahoo.search')

  .constant('PROCESS_BATCH_SIZE', 50)

  /**
   * Proxy for either local or remote search.
   */
  .factory('MessageSearch__Local', function (
        $rootScope, $promiseForEach, $q, $timeout,
        LocalJSONP, IndexData, MessageData, memoize) {

    var index = null;

    var loadingStarted = false;

    var chunkI = 0;
    var totalChunks = 0;
    var progress = function (cur, total) {
      chunkI = cur;
      totalChunks = total;
    };

    elasticlunr.clearStopWords();

    return {
      startLoading: startLoading,
      finishedLoading: finishedLoading,
      getLoadingProgress: getLoadingProgress,
      getSearchResults: memoize(getSearchResults, 10)
    };

    // ------------------------------------------------

    /**
     * Start loading the search.
     */
    function startLoading() {
      if (loadingStarted) {
        return;
      }

      loadingStarted = true;

      LocalJSONP.loadCompressed('./data/data.searchIndex', progress).then(function (obj) {
        index = elasticlunr.Index.load(obj);
      });
    }

    /**
     * Return whether search loading finished
     * @returns {boolean}
     */
    function finishedLoading() {
      if (!totalChunks) {
        return false;
      }

      return chunkI === totalChunks;
    }

    /**
     * Return the index loading progress, as a number from 0 to 1.
     * @returns {number}
     */
    function getLoadingProgress() {
      if (!totalChunks) {
        return 0;
      }

      return chunkI / totalChunks;
    }

    /** Parse a search string.
     *
     * split off tokens of:
     *  - word
     *  - "multiple words in quotes"
     *  - tag:word
     *  - tag:"multiple words in quotes"
     *
     * @param searchText
     * @returns {{}}
       */
    function parseSearchText(searchText) {
      var tagToField = {
        any: 'any',
        author: 'shortDisplayAuthor',
        from: 'shortDisplayAuthor',
        by: 'shortDisplayAuthor',
        title: 'subject',
        subject: 'subject',
        body: 'messageBody',
        message: 'messageBody'
      };

      // split off tokens of:
      //  - word
      //  - "multiple words in quotes"
      //  - tag:word
      //  - tag:"multiple words in quotes"

      var tokens = searchText.match(/\w+:\w+|\w+:"[^"]+"|\w+|"[^"]+"/g);

      var search = {};

      tokens.forEach(function (token) {
        var tag = 'any', body = token;
        if (token[0] !== '"' && token.indexOf(":") !== -1) {
          var newTag = token.substring(0, token.indexOf(":"));
          if (tagToField[newTag]) {
            tag = newTag;
            body = token.substring(token.indexOf(":") + 1, token.length);
          }
        }

        var field = tagToField[tag] || 'any';

        if (!search[field]) {
          search[field] = [];
        }

        search[field].push(body);
      });

      return search;
    }

    function mergeSearchResults(results, bool) {
      bool = bool || "AND";
      if (!(bool === "OR" || bool === "AND")) {
        throw new Error("Invalid bool for merging: " + bool);
      }
      if (bool === "OR") {
        throw new Error("'OR' not implemented yet");
      }

      if (results.length === 0) {
        return results;
      }

      // init with first results
      var merged = results[0];

      // drop results that are not included
      results.forEach(function (result, i) {
        if (i === 0) return;

        // turn result into a map
        var refToScore = {};
        result.forEach(function (doc) {
          refToScore[doc.ref] = doc.score;
        });

        // calculate what to keep
        var keep = [];
        merged.forEach(function (doc) {
          if (!(doc.ref in refToScore)) {
            // result in current set was not in the new search, so
            // drop it
            return;
          }

          keep.push({ref: doc.ref, score: doc.score + refToScore[doc.ref]});
        });

        // update new result
        merged = keep;
      });

      return merged;
    }

    /**
     * Get search results for a given text. Assumes indexing has finished.
     */
    function getSearchResults(searchText) {
      var search = parseSearchText(searchText);

      var results = [];
      for (var field in search) {
        var thisSearch = search[field].join(" ");
        var fields = {};

        if (field === 'any') {
          fields = {
            shortDisplayAuthor: {boost: 10},
            messageBody: {boost: 3},
            subject: {boost: 1}
          };
        } else {
          fields = {};
          fields[field] = {boost: 1};
        }

        results.push(index.search(thisSearch, {
          fields: fields,
          expand: true,
          bool: "AND"
        }));
      }

      return mergeSearchResults(results, "AND");
    }

  })

;
