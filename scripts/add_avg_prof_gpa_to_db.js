var express = require('express');
var sqlite3 = require('sqlite3').verbose();
var async = require('async');
var Q = require('q');
var fs = require('fs');
var readline = require('readline');

var router = express.Router();
var db = new sqlite3.Database('scheduleme.db');

// Custom global variables for this program
var gpa_by_prof = {};
var deferredCount;

// Execute this script from the command line: node add_avg_prof_gpa_to_db.js 
// (only after init_db.js has been run).
run();

function run() {
    db.run("CREATE TABLE if not exists PROFESSOR(" + 
        "professor_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL," + 
        "professor_name VARCHAR(255) NOT NULL," +
        "avg_gpa REAL NOT NULL," +
        "UNIQUE(professor_name) ON CONFLICT IGNORE);");
    db.run("ALTER TABLE section ADD COLUMN professor_id INTEGER " +
        "REFERENCES professor(professor_id);", function(err) {
        // Ignore already-exists error.
    });

    async.waterfall([
        function parseFiles(callback) {
            readAndParseFiles().then(function() {
                callback(null);
            });
        },
        function getProfessorNamesFromDB(callback) {
            console.log('Done parsing GPA data files.');
            db.all("SELECT section_id, professor FROM SECTION;", function(err, rows) {
                if (err) callback(err);
                for (var i = 0; i < rows.length; i++) {
                    var key = formatProfName(rows[i].professor);
                    if (gpa_by_prof[key] !== undefined) {
                        if (gpa_by_prof[key].section_ids === undefined) 
                            gpa_by_prof[key].section_ids = [];
                        gpa_by_prof[key].section_ids.push(rows[i].section_id);
                    } 
                }
                callback(null);
            });
        },
        function populateProfTable(callback) {
            console.log('Done getting professor names from DB.');
            deferredCount = 0;
            for (var prof_name in gpa_by_prof) {
                var gpa = gpa_by_prof[prof_name].gpa;
                deferredCount += 1;
                db.run(
                    "INSERT INTO professor(professor_name, avg_gpa) VALUES(?, ?);", [prof_name, gpa], 
                    function(err) {
                        if (err) callback(err);
                        deferredCount -= 1;
                        console.log("Rows remaining: " + deferredCount);
                    }
                );
            }
            waitForAllRecordsToSave(callback);
        },
        function getProfessorFKs(callback) {
            deferredCount = 0;
            for (var prof_name in gpa_by_prof) {
                deferredCount += 1;
                executeInnerQuery(prof_name).then(function(prof) {
                    deferredCount -= 1;
                });
            }
            waitForAllRecordsToSave(callback);
        },
        function updateSectionTableFK(callback) {
            console.log('Done populating professor table.');
            deferredCount = 0;
            for (var prof_name in gpa_by_prof) {
                if (!gpa_by_prof[prof_name].section_ids) {
                    continue;
                }
                deferredCount += 1;
                var section_ids = gpa_by_prof[prof_name].section_ids.toString()
                        .replace('[', '').replace(']', ''),
                    professor_id = gpa_by_prof[prof_name].professor_id;
                db.run(
                    "UPDATE section SET professor_id = " + professor_id + 
                    " WHERE section_id IN (" + section_ids + ");", 
                    function(err) {
                        if (err) callback(err);
                        deferredCount -= 1;
                        console.log("Rows remaining: " + deferredCount);
                    }
                );
            }
            waitForAllRecordsToSave(callback);
        }
    ], function(err) {
        if (err) {
            console.log("Error: " + err + ".");
        } else {
            console.log('Successfully added ' + 
                'average professor gpa data to database.');
        }
    });
};

function readAndParseFiles() {
    var deferred = Q.defer();
    var dir = __dirname;
    dir = dir.substring(0, dir.lastIndexOf('/')) + '/gpa_data/';

    var files_to_parse = [
        {file: dir + '199908_to_201208.csv', gpaPosFromEnd: 1, includeFirstLine: true},
        {file: dir + '201305.csv', gpaPosFromEnd: 2, includeFirstLine: false},
        {file: dir + '201308_201402_201405.csv', gpaPosFromEnd: 2, includeFirstLine: false}
    ];

    parseFile(files_to_parse[0]).then(function() {
        return parseFile(files_to_parse[1]);
    }).then(function() {
        return parseFile(files_to_parse[2]);
    }).then(function() {
        for (var key in gpa_by_prof) {
            var prof = gpa_by_prof[key];
            prof.gpa = (prof.freq === 0) ? 0 : prof.gpa_sum / prof.freq;
        }
        deferred.resolve(gpa_by_prof);
    });

    return deferred.promise;
};


function parseFile(file_to_parse) {
    var deferred = Q.defer();
    var firstLine = true;
    var rd = readline.createInterface({
        input: fs.createReadStream(file_to_parse.file)
    }).on('line', function(line) {
        if (true === file_to_parse.includeFirstLine || false === firstLine) {
            var gpa = getGPAFromLine(line, file_to_parse.gpaPosFromEnd),
                prof = getProfFromLine(line);
            if (undefined === gpa_by_prof[prof]) {
                gpa_by_prof[prof] = {gpa_sum: 0, freq: 0};
            } 
            // GPAs of 0 might mean that the GPA in the csv file is N/A
            // or no GPA was recorded for that class: either way, this is not
            // a valid GPA, so skip it.
            if (gpa > 0) {
                gpa_by_prof[prof].gpa_sum += gpa;
                gpa_by_prof[prof].freq += 1;
            }
        }
        firstLine = false;
    }).on('close', function() {
        deferred.resolve();
    });
    return deferred.promise;
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
    line = line.substring(line.indexOf('"') + 1, line.lastIndexOf('"'));
    return formatProfName(line);
};

function formatProfName(name) {
    if (!name) 
        return name;
    if (name.indexOf(', ') !== -1) 
        name = name.replace(' ', '');
    var i = name.indexOf(' '),
        j = name.indexOf(',');
    if (i < j && i > -1 && j > -1)
        name = name.substring(0, i) + name.substring(j);
    var k = name.indexOf(' ');
    if (k > -1)
        name = name.substring(0, k + 1) + name[k + 1];
    return name;
};

function waitForAllRecordsToSave(callback) {
    if (deferredCount === 0) {
        callback(null);
    } else {
        setTimeout(waitForAllRecordsToSave, 100, callback);
    }
};

function executeInnerQuery(name) {
    var deferred = Q.defer();
    db.all("SELECT professor_id from professor where professor_name = ?;", [name], 
        function(err, rows) {
            gpa_by_prof[name].professor_id = rows[0].professor_id;
            deferred.resolve(gpa_by_prof[name]);
        }
    );
    return deferred.promise;
};