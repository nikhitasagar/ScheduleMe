var async = require('async');
var Q = require('q');
var fs = require('fs');
var readline = require('readline');

var gpa_by_prof = {};

function run() {
    var deferred = Q.defer();
    var dir = __dirname;
    dir = dir.substring(0, dir.lastIndexOf('/')) + '/gpa_data/';

    var files_to_parse = [
        {file: dir + '199908_to_201208.csv', gpaPosFromEnd: 1, includeFirstLine: true},
        {file: dir + '201305.csv', gpaPosFromEnd: 2, includeFirstLine: false},
        {file: dir + '201308_201402_201405.csv', gpaPosFromEnd: 2, includeFirstLine: false}
    ];

    async.waterfall([
        function parseFirstFile(callback) {
            parseFile(files_to_parse[0], callback);
        }, 
        function parseSecondFile(callback) {
            parseFile(files_to_parse[1], callback);
        },
        function parseThirdFile(callback) {
            parseFile(files_to_parse[2], callback);
        }
    ], function(err) {
        for (var key in gpa_by_prof) {
            var prof = gpa_by_prof[key];
            prof.gpa = (prof.freq === 0) ? 0 : prof.gpa_sum / prof.freq;
        }
        deferred.resolve(gpa_by_prof);
    });
    return deferred.promise;
};


function parseFile(file_to_parse, callback) {
    var lineCount = 0;
    var rd = readline.createInterface({
        input: fs.createReadStream(file_to_parse.file)
    }).on('line', function(line) {
        if (true === file_to_parse.includeFirstLine || lineCount > 0) {
            var gpa = getGPAFromLine(line, file_to_parse.gpaPosFromEnd),
                prof = getProfFromLine(line);
            if (undefined === gpa_by_prof[prof]) {
                gpa_by_prof[prof] = {gpa_sum: 0, freq: 0};
            } 
            gpa_by_prof[prof].gpa_sum += gpa;
            gpa_by_prof[prof].freq += 1;
        }
        lineCount++;
    }).on('close', function() {
        callback(null);
    })
};

function getGPAFromLine(line, pos) {
    var count = 0, 
        i = line.length - 1;
    for ( ; i != 0; i--) {
        if (line[i] === ',') count++;
        if (count === pos) break;
    }
    var gpa = '',
        j = i + 1;
    while (line[j] !== ',' && j !== line.length) {
        gpa += line[j];
        j++;
    }
    console.assert('N/A' === gpa || false === isNaN(parseFloat(gpa)), gpa);
    return ('N/A' === gpa) ? 0 : parseFloat(gpa);
};

function getProfFromLine(line) {
    return line.substring(line.indexOf('"') + 1, line.lastIndexOf('"'));
};

module.exports.run = run;