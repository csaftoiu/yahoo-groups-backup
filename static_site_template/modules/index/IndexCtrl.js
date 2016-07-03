'use strict';

angular.module('staticyahoo.index', ['staticyahoo.message'])

  .controller('IndexCtrl', function (
      $scope, $timeout, $filter, $rootScope, $state,
      IndexData, MessageData
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

                var res = subj_link + '<br><span class="snippet">' + row.snippet + '</span>';

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
                return $filter('escapeHtml')($filter('messageAuthor')(row, false));
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
