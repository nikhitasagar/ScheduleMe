var express = require('express');
var sqlite3 = require('sqlite3').verbose();
var async = require('async');

var router = express.Router();
var db = new sqlite3.Database('scheduleme.db');

/**
 * Get latest semester.
 */
router.use(function(req, res, next) {
    var thisMonth = new Date().getMonth() + 1,
        thisSemester = (thisMonth >= 1 && thisMonth < 5) ? 'Spring' :
            (thisMonth >= 5 && thisMonth < 8) ? 'Summer' :
            'Fall',
        query = "SELECT * FROM semester WHERE term = '" + thisSemester + "';";

    async.waterfall([
        function(callback) {
            db.all(query, function(err, rows) {
                callback(null, rows);
            });
        }
    ], function (err, rows) {
        if (rows && rows.length > 0) {
            res.status(200).send(rows[0]);
        } else {
            res.status(404).send('No semesters found.');
        }
    });
});

module.exports = router;