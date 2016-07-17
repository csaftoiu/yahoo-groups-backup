/**
 * A node script to generate an elasticlunr index and zip it, in pieces, for
 * a Yahoo! groups static site backup.
 */

var path = require('path');
var fs = require('fs');
var extend = require('util')._extend;

var elasticlunr = require('../../static_site_template/js/elasticlunr.min.js');

var LocalJSONP = require('./LocalJSONP.js');

// ---------------------------

// how many bytes to split the stringified JSON file into
var CHUNK_SIZE = 10*1024*1024;

// ---------------------------

elasticlunr.clearStopWords();

main();

// ---------------------------

function main() {
  var searchIndex = null;
  var messageIndex = null;
  var config = null;

  var args = process.argv.slice(2);

  var pathToData = args[0];

  if (!pathToData) {
    console.error("Need path to data directory as first argument");
    process.exit(1);
  }

  searchIndex = createIndex();

  loadMessageIndex(pathToData).then(function (data) {
    messageIndex = data;

    messageIndex.idToRow = {};
    for (var i=0; i < messageIndex.length; i++) {
      messageIndex.idToRow[messageIndex[i].id] = messageIndex[i];
    }
  }).then(function () {
    return loadConfig(pathToData);
  }).then(function (config_) {
    config = config_;
  }).then(function () {
    return processBatches(config, pathToData, messageIndex, searchIndex, 0);
  }).then(function () {

    console.log("toJSON...");
    var jsonObj = searchIndex.toJSON();
    console.log("Stringifying...");
    var strData = JSON.stringify(jsonObj);

    return LocalJSONP.storeCompressed(strData, CHUNK_SIZE, path.join(pathToData, 'data.searchIndex'));
  }).then(function () {
    console.log("Done!");
  }).catch(function (err) {
    console.error("There was an error:", err);
  });
}

function createIndex() {
  return elasticlunr(function () {
    this.addField("subject");
    this.addField("shortDisplayAuthor");
    this.addField("messageBody");
    this.setRef('id');
    this.saveDocument(false);
  });
}

function loadConfig(pathToData) {
  return LocalJSONP.LocalJSONP(path.join(pathToData, 'data.config.js'));
}

function loadMessageIndex(pathToData) {
  return LocalJSONP.LocalJSONP(path.join(pathToData, 'data.index.js'));
}

function processBatches(config, pathToData, messageIndex, searchIndex, startI) {
  if (startI > config.lastMessageNumber) {
    console.log("Done!");
    return;
  }

  var endI = startI + config.messageDbPageSize;

  var messageDataFn = path.join(pathToData, 'data.messageData-' + startI + '-' + endI + '.js');

  return LocalJSONP.LocalJSONP(messageDataFn).then(function (data) {
    console.log("Processing", data.length, "messages...");
    for (var i=0; i < data.length; i++) {
      var toAdd = {};
      extend(toAdd, data[i]);
      extend(toAdd, messageIndex.idToRow[data[i].id]);

      // remove HTML from message body to not confuse the search
      toAdd.messageBody = toAdd.messageBody.replace(/<[^>]+>/g, " ");
      searchIndex.addDoc(toAdd);
    }
  }).then(function () {
    // process next batch
    return processBatches(config, pathToData, messageIndex, searchIndex, endI);
  });
}
