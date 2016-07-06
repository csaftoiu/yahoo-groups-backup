'use strict';

angular.module('staticyahoo.search')

  /**
   * Proxy for either local or remote search.
   */
  .factory('MessageSearch__Local', function ($rootScope, $promiseForEach,
                                             $q, $timeout,
                                             IndexData, MessageData) {

    elasticlunr.clearStopWords();
    var index = elasticlunr(function () {
      this.addField("subject");
      this.addField("shortDisplayAuthor");
      this.addField("displayDate");
      this.addField("messageBody");
      this.setRef('id');
      this.saveDocument(false);
    });

    var lastProcessedMessage = 0;
    var lastMessageNumber = null;
    IndexData.getLastMessageNumber().then(function (m) {
      lastMessageNumber = m;
      // start processing it all
      processBatches();
    });

    /**
     * Process the next batch of messages, returning
     * a promise for when the processing finishes.
     */
    var BATCH_SIZE = 50;
    var processBatches = function () {
      console.log("Processing next batch...", lastProcessedMessage);
      var ids = [];
      for (var id = lastProcessedMessage + 1; id < lastProcessedMessage + BATCH_SIZE + 1; id++) {
        if (id > lastMessageNumber) {
          break;
        }
        ids.push(id);
      }
      if (ids.length === 0) {
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
        if (locals.procced > BATCH_SIZE / 10) {
          return $q(function (resolve, reject) {
            $timeout(resolve, 10);
          });
        }
      }).then(processBatches);
    };

    /**
     * Return the index loading progress, as a number from 0 to 1.
     * @returns {number}
     */
    var getLoadingProgress = function () {
      if (!lastMessageNumber) {
        return 0;
      }

      return lastProcessedMessage / lastMessageNumber;
    };

    /**
     * Get search results for a given text. Assumes indexing has finished.
     */
    var getSearchResults = function (searchText) {
      return index.search(searchText, {
        expand: true
      });
    };

    return {
      finishedLoading: function () { return lastProcessedMessage === lastMessageNumber; },
      getLoadingProgress: getLoadingProgress,
      getSearchResults: getSearchResults
    };
  })

;
