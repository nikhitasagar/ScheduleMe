
var express = require('express');
var sqlite3 = require('sqlite3').verbose();
var async = require('async');

var router = express.Router();
var db = new sqlite3.Database('scheduleme.db');

router.use(function(req, res, next) {
    var schedule_id = (req.schedule_id) ? req.schedule_id.trim() : null;

    if (!schedule_id) {
        return res.status(400).send('Missing required parameter schedule_id.');
    }

    // Delete the section_schedules before the schedule itself, because
    // the former rely on the latter via foreign keys.
    async.waterfall([
        function(callback) {
            db.run('delete from sectionschedule where schedule_id = $schedule_id;', {
                $schedule_id: schedule_id,
            }, function(err) {
                callback(err);
            });
        },
        function(callback) {
            db.run('delete from schedule where schedule_id = $schedule_id;', {
                $schedule_id: schedule_id,
            }, function(err) {
                callback(err);
            });
        }
    ], function (err) {
        if (err) {
            return res.status(500).send(err);
        } else {
            return res.status(200).send('Successfully delete schedule with ' +
                'schedule_id: ' + schedule_id + '.');
        }
    });
});

module.exports = router;


