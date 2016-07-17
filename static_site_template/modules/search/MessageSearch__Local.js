'use strict';

angular.module('staticyahoo.search')

  .constant('PROCESS_BATCH_SIZE', 50)

  /**
   * Proxy for either local or remote search.
   */
  .factory('MessageSearch__Local', function (
        $rootScope, $promiseForEach, $q, $timeout,
        LocalJSONP, IndexData, MessageData) {

    var index = null;

    var chunkI = 0;
    var totalChunks = 0;
    var progress = function (cur, total) {
      chunkI = cur;
      totalChunks = total;
    };

    elasticlunr.clearStopWords();

    LocalJSONP.loadCompressed('./data/data.searchIndex', progress).then(function (obj) {
      index = elasticlunr.Index.load(obj);
    });

    return {
      finishedLoading: finishedLoading,
      getLoadingProgress: getLoadingProgress,
      getSearchResults: getSearchResults
    };

    // ------------------------------------------------

    /**
     * Return whether search loading finished
     * @returns {boolean}
     */
    function finishedLoading() {
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

    /**
     * Get search results for a given text. Assumes indexing has finished.
     */
    function getSearchResults(searchText) {
      return index.search(searchText, {
        fields: {
          // author should vastly outstrip subject/body
          shortDisplayAuthor: {boost: 10},
          messageBody: {boost: 3},
          subject: {boost: 1}
        },
        expand: true
      });
    }

  })

;
