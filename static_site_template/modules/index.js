'use strict';

angular.module('staticyahoo.index', ['staticyahoo.message'])

  // from http://stackoverflow.com/questions/14462612/escape-html-text-in-an-angularjs-directive
  .filter('escapeHtml', function () {

    var entityMap = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': '&quot;',
      "'": '&#39;',
      "/": '&#x2F;'
    };

    return function(str) {
      return String(str).replace(/[&<>"'\/]/g, function (s) {
        return entityMap[s];
      });
    }
  })

  /**
   * Local data source for the index data.
   */
  .factory('LocalIndexDataSource', function (LocalJSONP, $state) {
    // start loading the file
    var dataPromise = LocalJSONP('./data/data.index.js');

    // initialize the loki database
    var db = new loki();
    // index everything we want to sort by
    var coll = db.addCollection('index', {
      indices: ["author", "id", "subject", "timestamp"]
    });

    // map message id to the index data
    var idToIndex = {};

    dataPromise.then(function (data) {
      var i;

      console.log("Index data loaded!");

      // Calculate prevInTime/nextInTime
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
  .factory('IndexData__Local', function ($q, LocalIndexDataSource) {
    var indexView = LocalIndexDataSource.lokiCollection.getDynamicView("indexTable");
    if (!indexView) {
      indexView = LocalIndexDataSource.lokiCollection.addDynamicView("indexTable");
    }

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
     *     data: The data
     * }
     */

    var getSortedFilteredRows = function (request) {
      return LocalIndexDataSource.getData().then(function (data) {
        // apply the sort to the view, if there is one
        if (request.sortColumn) {
          var desc = !request.sortAscending;
          indexView.applySimpleSort(request.sortColumn, desc);
        }

        // resolve the data
        var sortedFilteredData = indexView.data();

        return {
          totalLength: data.length,
          filteredLength: sortedFilteredData.length,
          data: sortedFilteredData.slice(request.start, request.start + request.length)
        };
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
          console.log("Message " + id + " not found in index");
          return null;
        } else {
          return indexRow;
        }
      });
    };

    return {
      getSortedFilteredRows: getSortedFilteredRows,
      getRow: getRow
    };
  })

  /**
   * Proxy for either local or remote index data.
   */
  .factory('IndexData', function ($injector) {
    return $injector.get('IndexData__Local');
  })

  .factory('MessageIndex', function () {
    var formatMessageAuthor = function (row, includeEmail) {
      includeEmail = includeEmail || false;

      var res;

      if (row.authorName && row.profile) {
        if (row.authorName === row.profile) {
          res = row.authorName;
        } else {
          res =row.authorName + " (" + row.profile + ")";
        }
      }
      else if (row.authorName) {
        res = row.authorName;
      }
      else if (row.profile) {
        res = row.profile;
      }
      else if (row.from) {
        return row.from;
      }
      else {
        res = "???";
      }

      if (includeEmail) {
        res += " <" + row.from + ">";
      }

      return res;
    };

    return {
      formatMessageAuthor: formatMessageAuthor
    };
  })

  .controller('IndexCtrl', function (
      $scope, $timeout, $filter, $rootScope, $state,
      IndexData, MessageIndex, MessageData
  ) {


    // Note: IndexData loads & indexes right away
    // this is fine as it only happens once and doesn't take long

    // mark whether table is initialized to prevent ugliness
    $scope.tableInitialized = false;

    var messageUrl = function (messageId) {
      return $state.href('message', { id: messageId });
    };

    var initializeIndexTable = function () {
      // show timezone in header
      $("#tz").html(" (" + (new Date()).format("Z") + ")");

      // initialize table
      var table = $('#messageIndexTable').DataTable({

        // set up the display
        dom: "<'row'<'col-sm-6'l><'col-sm-6'p>>" +
        "<'row'<'col-sm-12'tr>>" +
        "<'row'<'col-sm-5'i><'col-sm-7'p>>",
        pagingType: "simple_numbers",
        lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],

        // 'server-side' processing so the entire DOM doesn't render at once
        serverSide: true,

        // data source is actually taken from an in-memory js database
        ajax: function (request, callback, settings) {
          IndexData.getSortedFilteredRows({
            start: request.start,
            length: request.length,
            sortColumn: request.order[0] ? request.columns[request.order[0].column].data : null,
            sortAscending: request.order[0] ? request.order[0].dir !== "desc" : false
          }).then(function (result) {
            callback({
              draw: request.draw,
              recordsTotal: result.totalLength,
              recordsFiltered: result.filteredLength,
              data: result.data
            });
          });
        },

        // initially sort by descending message id
        order: [[3, "desc"]],

        // column defs:
        // - data source
        // - bootstrap grid
        // - render links, dates, etc.
        columns: [
          {
            data: "subject",
            className: "col-xs-4  col-sm-4 col-md-5 col-lg-6",
            // render link to message
            render: function (data, type, row, meta) {
              if (type === 'display') {
                var subj_link = '<a href="' + messageUrl(row.id) + '">' + $filter('escapeHtml')(data) + '</a>';

                var res = subj_link + '<br><small>test</small>';

                return res;
              }

              return data;
            }
          },
          {
            data: null,  // this column is compiled from multiple parts of the row
            className: "col-xs-4  col-sm-3 col-md-3 col-lg-3",
            render: function (data, type, row, meta) {
              if (type === 'display' || type === 'filter' || type === 'sort') {
                return $filter('escapeHtml')(MessageIndex.formatMessageAuthor(row, false));
              }

              return data;
            }
          },
          {
            data: "timestamp",
            className: "col-xs-4  col-sm-3 col-md-3 col-lg-2",
            render: function (data, type, row, meta) {
              // display & filter based on rendered date
              if (type === 'display' || type === 'filter') {
                return $filter('date')(data * 1000, $rootScope.dateFormat);
              }

              // otherwise pass-through the data
              return data;
            }
          },
          {
            data: "id",
            className: "hidden-xs col-sm-2 col-md-1 col-lg-1",
            // render link to message
            render: function (data, type, row, meta) {
              if (type === 'display') {
                return '<a href="' + messageUrl(row.id) + '">' + data + '</a>';
              }

              return data;
            }
          }
        ],

        // add bootstrap grid style to rows
        fnRowCallback: function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
          $(nRow).addClass('row');
        },

        // on complete, display the table
        initComplete: function (settings, json) {
          console.log("Index table initialized!");
          $scope.tableInitialized = true;
        }
      });

    };

    // wait for a page render and start rendering table data
    $timeout(initializeIndexTable, 10);

  })

;
