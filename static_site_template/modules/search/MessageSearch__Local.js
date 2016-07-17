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

      // set at 0 in case something goes wrong ...
      localStorageService.set("indexCacheBuster", 0);

      localStorageService.set("lastProcessedMessage", lastProcessedMessage);
      localStorageService.set("indexCacheBuster", $rootScope.config.cacheBuster);

      console.log("getting index JSON...");
      var searchIndexObj = index.toJSON();

      console.log("Stringifying...");
      var data = JSON.stringify(searchIndexObj);
      console.log("Uncompressed size is", data.length / 1024, "kB, compressing bit by bit at a time...");

      var CHUNK_SIZE = 10*1024*1024;
      var pieceI = 0;
      for (var start=0; start < data.length; start += CHUNK_SIZE) {
        var piece = LZString.compress(data.slice(start, start + CHUNK_SIZE));
        console.log(
          "Compressed piece #", pieceI,
          "from", start / 1024, "kB to", (start + CHUNK_SIZE)/1024,
          "kB into", piece.length / 1024, "kB, storing now...");
        localStorageService.set("searchIndexJSON.LZString." + pieceI, piece);
        console.log("Stored piece #", pieceI);
        pieceI++;
      }
      console.log("all done!");
/*
      var compData = LZString.compress(data);
      console.log("Compressed size is", compData.length / 1024, "kB, storing...");

      localStorageService.set("searchIndexJSON.LZString", compData);

      console.log("Done!");*/
    }

    /**
     * Initialize the index, either a new one, or loaded from
     * local storage.
     */
    function loadIndex() {

      var curCacheBuster = $rootScope.config.cacheBuster;
      console.log("curCacheBuster is", curCacheBuster);
      var storedCacheBuster = curCacheBuster; // localStorageService.get("indexCacheBuster");
      var storedSearchIndexObj = null;
      if (storedCacheBuster === curCacheBuster) {
        // load index
        console.log("Loading index from cache!");
        try {
          var data = "";
          var pieceI = 0;
          console.log(localStorageService.keys());
          while (true) {
            var piece = localStorageService.get("searchIndexJSON.LZString." + pieceI);
            if (piece === undefined || piece === null) {
              console.log("Didn't get piece for #", pieceI);
              break;
            }
            console.log("Decompressing piece #", pieceI, "of", piece.length / 1024, "kB")
            data += LZString.decompress(piece);
            pieceI++;
          }

          console.log("Parsing the JSON of", data.length / 1024, "kB");
          storedSearchIndexObj = JSON.parse(data);
        } catch (e) {
          console.error(e);
          console.error("Couldn't load index from cache, starting from scratch");
          storedSearchIndexObj = null;
        }
      } else {
        console.log("stored buster was", storedCacheBuster, "but we need", curCacheBuster);
      }

      if (storedSearchIndexObj) {
        index = elasticlunr.Index.load(storedSearchIndexObj);
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
