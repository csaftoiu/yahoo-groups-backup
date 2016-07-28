'use strict';

angular.module('staticyahoo.index', ['staticyahoo.message', 'staticyahoo.search'])

  .controller('IndexCtrl', function (
      $scope, $timeout, $filter, $rootScope, $state,
      IndexData, MessageSearch
  ) {

    var dtTable = null;

    // checking initialization variables
    $scope.searchEnabled = false;
    $scope.tableInitialized = false;
    $scope.searchFinishedLoading = function () {
      return MessageSearch.finishedLoading();
    };
    $scope.searchProgress = function () {
      return MessageSearch.getLoadingProgress();
    };

    $scope.enableSearch = function () {
      $scope.searchEnabled = true;
      MessageSearch.startLoading();
    };

    // search parameters
    $scope.search = {
      text: ''
    };

    $scope.applySearch = function () {
      if (!dtTable) {
        console.log("This shouldn't happen");
        return;
      }

      dtTable.order([2, 'desc']);  // sort by descending date, as gmail does
      dtTable.draw('full-reset');
    };

    // pagination
    $scope.pagination = {
      sliderPageNumber: 1,
      pageHeaders: [],
      formatTooltip: function (pageNumber) {
        var rawValue = $scope.pagination.pageHeaders[pageNumber];

        if (rawValue === undefined) {
          return "";
        }

        var sortColumnName = dtTable.settings().init().columns[dtTable.order()[0][0]].name;

        if (sortColumnName === 'timestamp') {
          return $filter('date')(rawValue * 1000, $rootScope.dateFormat);
        }

        return rawValue;
      },
      formatTickLabel: function (pageNumber) {
        var rawValue = $scope.pagination.pageHeaders[pageNumber];

        if (rawValue === undefined) {
          return pageNumber;
        }

        var sortColumnName = dtTable.settings().init().columns[dtTable.order()[0][0]].name;

        if (sortColumnName === 'timestamp') {
          return $filter('date')(rawValue * 1000, 'MMM y');
        }

        if (sortColumnName === 'shortDisplayAuthor') {
          // remove after parenthesis
          if (rawValue.indexOf("(") !== -1) {
            rawValue = rawValue.substring(0, rawValue.indexOf("(") - 1);
          }
        }

        // snap to string
        rawValue = '' + rawValue;

        // don't let it get too long
        if (rawValue.length >= 12) {
          rawValue = rawValue.substring(0, 10) + "...";
        }

        return rawValue;
      },
      numPages: function () {
        if (!dtTable) {
          return 10;
        }

        return dtTable.page.info().pages;
      },
      setPageNumber: function (pageNumber) {
        dtTable.page(pageNumber).draw('page');
      },
      ticks: {
        indices: [],
        labels: [],
        snapBounds: 5
      },
      updateTicks: function () {
        var T = $scope.pagination.ticks;

        var numPages = dtTable.page.info().pages;
        if (!numPages) {
          T.indices = [];
          T.labels = [];
          return;
        }

        var numTicks = Math.min(5, numPages);

        var gap = (numPages - 1) / (numTicks - 1);

        T.indices = [0];
        for (var i=1; i < (numTicks - 1); i++) {
          T.indices.push(Math.round(gap*i));
        }
        T.indices.push(numPages - 1);

        T.labels = [];
        T.indices.forEach(function (pageNumber) {
          T.labels.push($scope.pagination.formatTickLabel(pageNumber));
        });

        T.snapBounds = Math.min(Math.floor(numPages * 0.02), 20);
        if (numTicks >= numPages - 1) {
          T.snapBounds = 0;
        }
      }
    };

    // wait for a page render and start rendering table data
    $timeout(initializeIndexTable, 10);

    // -----------------------------------

    /**
     * Get the URL to visit a message, given its id
     * @param messageId
     * @returns {*}
    */
    function messageUrl(messageId) {
      return $state.href('message', { id: messageId });
    }

    /**
     * Initialize the datatable
     */
    function initializeIndexTable() {
      // show timezone in header
      $("#tz").html(" (" + (new Date()).format("Z") + ")");

      // initialize table
      dtTable = $('#messageIndexTable').DataTable({

        // set up the display
        dom: "<'row'<'col-sm-3'l><'col-sm-9'p>>" +
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
            sortColumn: request.order[0] ? request.columns[request.order[0].column].name : null,
            sortAscending: request.order[0] ? request.order[0].dir !== "desc" : false,
            searchText: $scope.search.text
          }).then(function (result) {
            callback({
              draw: request.draw,
              recordsTotal: result.totalLength,
              recordsFiltered: result.filteredLength,
              data: result.data
            });
            $scope.pagination.pageHeaders = result.pageHeaders;
            $scope.pagination.sliderPageNumber = dtTable.page();
            $scope.pagination.updateTicks();
            $scope.$broadcast('slider:relayout');  // update tooltip
          });
        },

        // initially sort by descending date
        order: [[2, "desc"]],

        // column defs:
        // - data source
        // - bootstrap grid
        // - render links, dates, etc.
        columns: [
          {
            data: "subject",
            name: "subject",
            className: "col-xs-4  col-sm-4 col-md-5 col-lg-6 truncated",
            // render link to message
            render: function (data, type, row, meta) {
              if (type === 'display') {
                var subj_link = '<a href="' + messageUrl(row.id) + '">' + $filter('escapeHtml')(data) + '</a>';

                var res = subj_link + '<br><span class="snippet">' + row.snippet + '</span>';

                return res;
              }

              return data;
            }
          },
          {
            data: "shortDisplayAuthor",
            name: "shortDisplayAuthor",
            className: "col-xs-4  col-sm-3 col-md-3 col-lg-3 truncated",
            render: function (data, type, row, meta) {
              if (type === 'display' || type === 'filter' || type === 'sort') {
                return $filter('escapeHtml')(data);
              }

              return data;
            }
          },
          {
            data: "timestamp",
            name: "timestamp",
            className: "col-xs-4  col-sm-3 col-md-3 col-lg-2 truncated",
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
            name: "id",
            className: "hidden-xs col-sm-2 col-md-1 col-lg-1 truncated",
            // render link to message
            render: function (data, type, row, meta) {
              if (type === 'display') {
                return '<a href="' + messageUrl(row.id) + '">' + data + '</a>';
              }

              return data;
            }
          },
          {
            data: null,
            name: "searchRelevance",
            visible: false
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

          // update tooltip after layout
          $timeout(function () {
            $scope.pagination.updateTicks();
            $scope.$broadcast('slider:relayout');
          }, 0);
        }
      });

    }
  })

;
