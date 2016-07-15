var express = require('express');
var sqlite3 = require('sqlite3').verbose();
var async = require('async');

var router = express.Router();
var db = new sqlite3.Database('scheduleme.db');

/**
 * Get all professors. Dict is returned with format:
 * dict_entry[professor_id] => professor_name
 */
router.use(function(req, res, next) {
    async.waterfall([
        function getProfessors(callback) {
            var query = "SELECT * from professor;";
            db.all(query, function(err, rows) {
                callback(null, rows);
            });
        },
        function convertToDict(rows, callback) {
            var profDict = {};
            for (var i = 0; i < rows.length; i++) {
                var profID = rows[i]['professor_id'];
                profDict[profID] = {
                    'name': rows[i]['professor_name'],
                    'gpa': rows[i]['avg_gpa']
                };
            }
            callback(null, profDict);
        }
    ], function (err, profDict) {
        if (err) {
            return res.status(500).send(err);
        } else {
            return res.status(200).send(profDict);
        }
    });
});

module.exports = router;

