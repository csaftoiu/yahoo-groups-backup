/**
 * Node module to load and store the LocalJSONP format of the Yahoo! groups
 * backup.
 */
var fs = require('fs');
var util = require('util');
var LZString = require('../../static_site_template/js/lz-string.min.js');

var state = {
  path: null,
  hook: null,
  promise: null,
  script: null
};

/**
 * Data loaded callback.
 * @param data
 */
var dataLoaded = function (data) {
  if (!state.hook) {
    console.error("Data loaded without a hook!");
  }
  else {
    state.hook(data);
    state.hook = null;
  }
};

var loadLocalJS = function (path, callback) {
  state.hook = callback;

  fs.readFile(path, 'utf8', function (err, data) {
    if (err) {
      throw new Error("Error loading file: " + err);
    }

    // run the script
    eval(data);
  });
};

var LocalJSONP = function (path) {
  if (state.promise) {
    console.log("JSONP: WAITING '" + path + "'");

    return state.promise.then(function () {
      return LocalJSONP(path);
    });
  }

  console.log("JSONP: LOADING '" + path + "'");
  var promise = new Promise(function (resolve, reject) {
    loadLocalJS(path, function (data) {
      resolve(data);
    });
  });

  // set current promise
  state.promise = promise;
  state.path = path;

  // clear current promise when data is loaded
  state.promise.then(function () {
    state.promise = null;
    state.path = null;
  });

  return promise;
};

/**
 * Store a string at the given dest prefix, using the given chunk size.
 * e.g. if given a 4000-byte string, and chunkSize of 1000, and destPrefix
 * of some/dir/object , it would be stored in:
 *
 *     some/dir/object-part0.lz-b64.js
 *     some/dir/object-part1.lz-b64.js
 *     some/dir/object-part2.lz-b64.js
 *     some/dir/object-part3.lz-b64.js
 *
 * This would then be loadeable with loadCompressed("some/dir/object").
 *
 * Returns a promise when all chunks have been stored.
 */
var storeCompressed = function (strData, chunkSize, destPrefix) {
  console.log("Compressing", strData.length / 1024, "kB in", chunkSize / 1024, "kB chunks");

  var chunks = [];
  var totalSize = 0;
  for (var start = 0; start < strData.length; start += chunkSize) {
    console.log("Piece from", start / 1024, "kB to", (start + chunkSize) / 1024, "kb...");
    var chunk = LZString.compressToBase64(strData.slice(start, start + chunkSize));
    chunks.push(chunk);
    console.log("Result was", chunk.length / 1024, "kB");
    totalSize += chunk.length;
  }

  console.log("Total size:", totalSize / 1024, "kB");

  var storePs = [];

  chunks.forEach(function (chunk, i) {
    var data = util.format('dataLoaded(%s)', JSON.stringify({
      chunkI: i,
      totalChunks: chunks.length,
      chunkData: chunk
    }));

    storePs.push(new Promise(function (resolve, reject) {
      fs.writeFile(destPrefix + '-part' + i + '.lz.js', data, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(err);
        }
      });
    }));
  });

  return Promise.all(storePs);

};

exports.LocalJSONP = LocalJSONP;
exports.storeCompressed = storeCompressed;
