'use strict';

angular.module('staticyahoo.index')

  /**
   * Local data source for the index data.
   */
  .factory('LocalIndexDataSource', function ($filter, $q, $promiseForEach, $injector,
                                             LocalJSONP) {
    // initialize the loki database
    var db = new loki();
    // index everything we want to sort by
    var coll = db.addCollection('index', {
      indices: ["shortDisplayAuthor", "id", "subject", "timestamp"]
    });

    var dataPromise = LocalJSONP('./data/data.index.js').then(function (data) {
      var i;

      console.log("Index data loaded!");

      // Calculate:
      // * prevInTime
      // * nextInTime
      // * shortAuthor (displayed in index, needed for sorting)
      for (i=0; i < data.length; i++) {
        if (i === 0) {
          data[i].nextInTime = 0;
        } else {
          data[i].nextInTime = data[i-1].id;
        }

        if (i === data.length - 1) {
          data[i].prevInTime = 0;
        } else {
          data[i].prevInTime = data[i+1].id;
        }

        data[i].shortDisplayAuthor = $filter('messageAuthor')(data[i], false);
      }

      // insert into loki collection
      for (i=0; i < data.length; i++) {
        coll.insert(data[i]);
      }

      return data;
    });

    return {
      // promise for the data
      getData: function () { return dataPromise; },
      // the loki collection
      lokiCollection: coll
    };
  })

  /**
   * Local implementation of the IndexData service
   */
  .factory('IndexData__Local', function ($q, $injector, $filter, $promiseChainMap,
                                         LocalIndexDataSource) {
    var indexView = LocalIndexDataSource.lokiCollection.getDynamicView("indexTable");
    if (!indexView) {
      indexView = LocalIndexDataSource.lokiCollection.addDynamicView("indexTable");
    }

    /**
     * Helper to get all the message snippets for messages of the given ids.
     * @param ids
     */
    var getMessageSnippets = function (ids) {
      return $promiseChainMap(ids, function (id) {
        return $injector.get('MessageData').getMessageData(id).then(function (data) {
          return $filter('messageSnippet')(data.messageBody, 300);
        });
      });
    };

    /**
     * Get the index rows matching a request
     * @param request An object with the following keys:
     * {
     *     start: The start index into the total returned data to get
     *     length: The length to get
     *     sortColumn: The sort column name, or null if no sort
     *     sortAscending: Whether to sort by ascending.
     *  }
     * @returns A promise returning an object with: {
     *     totalLength: The total length of everything that matched
     *     filteredLength: The length of just what was returned
     *     data: The data,
     *     pageHeaders: a zero-indexed array of the first values of the sort column from each page
     * }
     */

    var getSortedFilteredRows = function (request) {
      var locals = {};

      return LocalIndexDataSource.getData().then(function (data) {
        // keep track of the total length
        locals.totalLength = data.length;

        // apply the sort to the view, if there is one
        if (request.sortColumn && request.sortColumn !== 'searchRelevance') {
          var desc = !request.sortAscending;
          // indexView.applySimpleSort(request.sortColumn, desc);
          var col = request.sortColumn;
          indexView.applySort(function (objA, objB) {
            var a = objA[col], b = objB[col];
            if (typeof a === "string") a = a.toUpperCase();
            if (typeof b === "string") b = b.toUpperCase();
            if (a < b) return desc ? 1 : -1;
            if (a > b) return desc ? -1 : 1;
          });
        }

        // resolve the data
        var sortedData = indexView.data();

        // filter these results if there is search text
        var sortedFilteredData = null;

        if (request.searchText) {
          // inject here to avoid circular dependency
          var MessageSearch__Local = $injector.get('MessageSearch__Local');
          var sortedSearchResults = MessageSearch__Local.getSearchResults(request.searchText);

          if (request.sortColumn === 'searchRelevance') {
            // keep in same order, just fill in row data
            sortedFilteredData = [];
            angular.forEach(sortedSearchResults, function (res) {
              sortedFilteredData.push(LocalIndexDataSource.lokiCollection.find({id: +res['ref']})[0]);
            });
          } else {
            // keep in same order as previous data

            // use object as a set
            var matching = {};
            angular.forEach(sortedSearchResults, function (res) {
              matching[res.ref] = 1;
            });

            // keep only these objects
            sortedFilteredData = [];
            for (var i=0; i < sortedData.length; i++) {
              if (matching[sortedData[i].id]) {
                sortedFilteredData.push(LocalIndexDataSource.lokiCollection.find({ id: sortedData[i].id })[0]);
              }
            }
          }

        } else {
          // if no search then do nothing
          sortedFilteredData = sortedData;
        }

        locals.filteredLength = sortedFilteredData.length;
        locals.rows = sortedFilteredData.slice(request.start, request.start + request.length);

        // calculate the page headers
        locals.pageHeaders = [];
        if (request.sortColumn && request.sortColumn !== 'searchRelevance') {
          for (var i=0; i < sortedFilteredData.length; i += request.length) {
            locals.pageHeaders.push(sortedFilteredData[i][request.sortColumn]);
          }
        }

        // get message snippets
        return getMessageSnippets(locals.rows.map(function (row) { return row.id; }));
      }).then(function (snippets) {
        // stick snippets onto it
        for (var i=0; i < locals.rows.length; i++) {
          locals.rows[i].snippet = snippets[i];
        }

        return {
          totalLength: locals.totalLength,
          filteredLength: locals.filteredLength,
          data: locals.rows,
          pageHeaders: locals.pageHeaders
        }
      });
    };

    /**
     * Get the row corresponding to a given id.
     * @param id The message id
     * @returns A promise returning the row for the id, or succeeding with null if the message
     * does not exit.
     */
    var getRow = function (id) {
      return LocalIndexDataSource.getData().then(function () {
        var indexRow = LocalIndexDataSource.lokiCollection.find({ id: id })[0];

        if (!indexRow) {
          // console.log("Message " + id + " not found in index");
          return null;
        } else {
          return indexRow;
        }
      });
    };

    /**
     * Return a promise getting the last message number
     */
    var getLastMessageNumber = function () {
        return LocalIndexDataSource.getData().then(function () {
          return LocalIndexDataSource.lokiCollection.chain().simplesort('-id').limit(1).data()[0].id;
        });
    };

    return {
      getLastMessageNumber: getLastMessageNumber,
      getSortedFilteredRows: getSortedFilteredRows,
      getRow: getRow
    };
  })

;
