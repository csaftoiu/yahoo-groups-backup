'use strict';

angular.module('staticyahoo.index', [])

  .controller('IndexCtrl', function ($scope, $timeout, LocalJSONP) {

    $scope.messageIndexLoaded = false;

    var initializeIndexTable = function () {
      // show timezone in header
      $("#tz").html(" (" + (new Date()).format("Z") + ")");

      // initialize table
      var table = $('#messageIndexTable').DataTable({

        // set up the display
        "dom": "<'row'<'col-sm-6'l><'col-sm-6'f>>" +
        "<'row'<'col-sm-5 go-to-message'><'col-sm-7'p>>" +
        "<'row'<'col-sm-12'tr>>" +
        "<'row'<'col-sm-5'i><'col-sm-7'p>>",
        "pagingType": "simple_numbers",
        "lengthMenu": [[10, 25, 50, 100], [10, 25, 50, 100]],

        // data source is a local .js file with the index data
        "ajax": function (data, callback, settings) {
          console.log("ajax called");
          LocalJSONP('./data/data.index.js').then(function (data) {
            console.log("Data loaded! Calling DataTables callback...");
            callback({'data': data});
          });
        },

        // initially sort by descending message id
        "order": [[3, "desc"]],

        // column defs:
        // - data source
        // - bootstrap grid
        // - render links, dates, etc.
        "columns": [
          {
            "data": "s",
            "className": "col-xs-4  col-sm-4 col-md-5 col-lg-6"
          },
          {
            "data": "a",
            "className": "col-xs-4  col-sm-3 col-md-3 col-lg-3"
          },
          {
            "data": "d",
            "className": "col-xs-4  col-sm-3 col-md-3 col-lg-2",
            "render": function (data, type, row, meta) {
              // display & filter based on rendered date
              if (type === 'display' || type === 'filter') {
                return (new Date(data * 1000)).format("mmm d, yyyy h:MM TT");
              }

              // otherwise pass-through the data
              return data;
            }
          },
          {
            "data": "i",
            "className": "hidden-xs col-sm-2 col-md-1 col-lg-1"
          }
        ],

        // add bootstrap grid style to rows
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
          $(nRow).addClass('row');
        },

        // on complete, display the table
        "initComplete": function (settings, json) {
          console.log("Index loading complete!");
          $scope.messageIndexLoaded = true;
        }
      });

    };

    // after page render, start loading table data
    $timeout(initializeIndexTable, 10);

  })

;
