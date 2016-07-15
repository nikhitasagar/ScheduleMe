var express = require('express');
var sqlite3 = require('sqlite3').verbose();
var Q = require('q');

var router = express.Router();
var db = new sqlite3.Database('scheduleme.db');

/**
 * Get all classes by semester id.
 */
router.use(function(req, res, next) {
    var semester_id = req.semester_id.trim();
    /* Since this is the first query that is invoked client-side, and since
     * sqlite3 might still be busy updating data in the database, keep
     * running this function recursively until success. 
     */ 
    runQuery(res, semester_id, 0);
});

function runQuery(res, semester_id, errorCount) {
    var query = "SELECT * from class WHERE semester_id = '" + semester_id + 
            "' order by department, class_number;";
    db.all(query, function(err, rows) {
        if (err) {
            if (errorCount < 10) {
                setTimeout(function() {
                    runQuery(res, semester_id, errorCount + 1);
                }, 1000);
            } else {
                return res.status(500).send(err);
            }
        } else {
            return res.status(200).send(rows);
        }
    });
};

module.exports = router;

