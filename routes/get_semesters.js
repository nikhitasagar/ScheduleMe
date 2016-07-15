var express = require('express');
var sqlite3 = require('sqlite3').verbose();
var async = require('async');

var router = express.Router();
var db = new sqlite3.Database('scheduleme.db');

/**
 * Get all semesters.
 */
router.use(function(req, res, next) {
    async.waterfall([
        function(callback) {
            var query = "SELECT * from semester order by semester_id desc;";
            db.all(query, function(err, rows) {
                callback(null, rows);
            });
        }
    ], function (err, rows) {
        if (err) {
            return res.status(500).send(err);
        } else {
            return res.status(200).send(rows);
        }
    });
});

module.exports = router;

