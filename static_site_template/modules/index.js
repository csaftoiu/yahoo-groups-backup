'use strict';

angular.module('staticyahoo.index', [])

  .factory('IndexData', function (LocalJSONP, $state) {

    var dataPromise = LocalJSONP('./data/data.index.js');

    // map message id to the index data
    var idToIndex = {};

    dataPromise.then(function (data) {
      console.log("Index data loaded!");
      for (var i=0; i < data.length; i++) {
        idToIndex[data[i].i] = data[i];
      }
      return data;
    });

    return {
      promise: dataPromise,
      idToIndex: idToIndex,
      messageUrl: function (messageId) {
        return $state.href('message', { id: messageId });
      }
    };
  })

  .controller('IndexCtrl', function ($scope, $timeout, $filter, $rootScope, IndexData) {

    $scope.messageIndexLoaded = false;

    var initializeIndexTable = function () {
      // show timezone in header
      $("#tz").html(" (" + (new Date()).format("Z") + ")");

      // initialize table
      var table = $('#messageIndexTable').DataTable({

        // set up the display
        dom: "<'row'<'col-sm-6'l><'col-sm-6'f>>" +
        "<'row'<'col-sm-5 go-to-message'><'col-sm-7'p>>" +
        "<'row'<'col-sm-12'tr>>" +
        "<'row'<'col-sm-5'i><'col-sm-7'p>>",
        pagingType: "simple_numbers",
        lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],

        // data source is a local .js file with the index data
        ajax: function (data, callback, settings) {
          console.log("ajax called");
          IndexData.promise.then(function (data) {
            console.log("Calling DataTables callback...");
            callback({'data': data});
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
            data: "s",
            className: "col-xs-4  col-sm-4 col-md-5 col-lg-6",
            // render link to message
            render: function (data, type, row, meta) {
              if (type === 'display') {
                return '<a href="' + IndexData.messageUrl(row.i) + '">' + data + '</a>';
              }

              return data;
            }
          },
          {
            data: "a",
            className: "col-xs-4  col-sm-3 col-md-3 col-lg-3"
          },
          {
            data: "d",
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
            data: "i",
            className: "hidden-xs col-sm-2 col-md-1 col-lg-1",
            // render link to message
            render: function (data, type, row, meta) {
              if (type === 'display') {
                return '<a href="' + IndexData.messageUrl(row.i) + '">' + data + '</a>';
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
          console.log("Index loading complete!");
          $scope.messageIndexLoaded = true;
        }
      });

    };

    // after page render, start loading table data
    $timeout(initializeIndexTable, 10);

  })

;
