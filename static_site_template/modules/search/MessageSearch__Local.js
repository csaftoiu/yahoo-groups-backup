'use strict';

angular.module('staticyahoo.search')

  .constant('PROCESS_BATCH_SIZE', 50)

  /**
   * Proxy for either local or remote search.
   */
  .factory('MessageSearch__Local', function (
        $rootScope, $promiseForEach, $q, $timeout,
        localStorageService,
        IndexData, MessageData,
        PROCESS_BATCH_SIZE) {

    var index;
    var lastProcessedMessage;
    var lastMessageNumber;

    init();

    return {
      finishedLoading: finishedLoading,
      getLoadingProgress: getLoadingProgress,
      getSearchResults: getSearchResults
    };

    // ------------------------------------------------

    /**
     * Store the index.
     */
    function storeIndex() {
      console.log("Storing with cache buster", $rootScope.config.cacheBuster);
      localStorageService.set("indexCacheBuster", $rootScope.config.cacheBuster);
      localStorageService.set("searchIndexObj", index.toJSON());
      localStorageService.set("lastProcessedMessage", lastProcessedMessage);
    }

    /**
     * Initialize the index, either a new one, or loaded from
     * local storage.
     */
    function loadIndex() {

      var curCacheBuster = $rootScope.config.cacheBuster;
      console.log("curCacheBuster is", curCacheBuster);
      var storedCacheBuster = localStorageService.get("indexCacheBuster");
      var stored = null;
      if (storedCacheBuster === curCacheBuster) {
        // load index
        console.log("Loading index from cache!");
        stored = localStorageService.get("searchIndexObj");
      }

      if (stored) {
        index = elasticlunr.Index.load(stored);
        lastProcessedMessage = localStorageService.get("lastProcessedMessage");
      } else {
        index = elasticlunr(function () {
          this.addField("subject");
          this.addField("shortDisplayAuthor");
          this.addField("messageBody");
          this.setRef('id');
          this.saveDocument(false);
        });
        lastProcessedMessage = 0;
      }
    }

    /**
     * Init the search module
     */
    function init() {
      elasticlunr.clearStopWords();

      loadIndex();

      // trigger loading once index data has been loaded
      IndexData.getLastMessageNumber().then(function (m) {
        lastMessageNumber = m;
        processBatches();
      });
    }

    /**
     * Process the next batch of messages, returning
     * a promise for when the processing finishes.
     */
    function processBatches() {
      var ids = [];
      for (var id = lastProcessedMessage + 1; id < lastProcessedMessage + PROCESS_BATCH_SIZE + 1; id++) {
        if (id > lastMessageNumber) {
          break;
        }
        ids.push(id);
      }

      if (ids.length === 0) {
        // finished processing all messages
        storeIndex();
        return;
      }

      var locals = {procced: 0};

      return $promiseForEach(ids, function (id) {
        return MessageData.getMessageData(id).then(function (msg) {
          lastProcessedMessage = id;

          // msg may not exist, just continue in this case
          if (!msg) {
            return;
          }
          var toAdd = {};
          angular.merge(toAdd, msg);
          // remove HTML from message body to not confuse the search
          toAdd.messageBody = msg.messageBody.replace(/<[^>]+>/g, " ");
          index.addDoc(toAdd);
          locals.procced++;
        });
      }).then(function () {
        // sleep a little
        if (locals.procced > PROCESS_BATCH_SIZE / 10) {
          return $q(function (resolve, reject) {
            $timeout(resolve, 10);
          });
        }
      }).then(processBatches);
    }

    /**
     * Return whether search loading finished
     * @returns {boolean}
     */
    function finishedLoading() {
      return lastProcessedMessage === lastMessageNumber;
    }

    /**
     * Return the index loading progress, as a number from 0 to 1.
     * @returns {number}
     */
    function getLoadingProgress() {
      if (!lastMessageNumber) {
        return 0;
      }

      return lastProcessedMessage / lastMessageNumber;
    }

    /**
     * Get search results for a given text. Assumes indexing has finished.
     */
    function getSearchResults(searchText) {
      return index.search(searchText, {
        fields: {
          shortDisplayAuthor: {boost: 5},
          messageBody: {boost: 3},
          subject: {boost: 1}
        },
        expand: true
      });
    }

  })

;
