var express = require('express');
var sqlite3 = require('sqlite3').verbose();
var TransactionDatabase = require('sqlite3-transactions').TransactionDatabase;
var async = require('async');
var Q = require('q');

var router = express.Router();
var db = new TransactionDatabase(
    new sqlite3.Database("scheduleme.db", sqlite3.OPEN_READWRITE)
);

var add_section_to_schedule = require('../scripts/add_section_to_schedule');

router.use(function(req, res, next) {
    var schedule_id = req.schedule_id,
        section_ids = req.body.sectionIDs,
        errors = [];

    db.beginTransaction(function(err, transaction) {
        async.waterfall([
            function(callback) {
                transaction.run('delete from sectionschedule where ' +
                    'schedule_id = $schedule_id;', {
                        $schedule_id: req.schedule_id,
                }, function(err) {
                    callback(err);
                });
            },
            function(callback) {
                for (var i = 0; i < section_ids.length; i++) {
                    add_section_to_schedule.execute(transaction, section_ids[i], 
                        schedule_id).then(function(result) {
                        if (result[0] === 500) {
                            errors.push(errors[1]);
                        }
                    });
                }
                callback(null);
            }
        ], function(err) {
            if (err) {
                transaction.rollback(function(transactionErr) {
                    if (transactionErr) {
                        return res.status(500).send(transactionErr);
                    } else {
                        return res.status(500).send(err);
                    }
                });
            } else if (errors.length > 0) {
                transaction.rollback();
                return res.status(500).send(errors);
            } else {
                transaction.commit(function(transactionErr) {
                    if (transactionErr) {
                        return res.status(500).send(transactionErr);
                    } else {
                        return res.status(200).send('Successfully updated ' + 
                            'schedule: ' + schedule_id + '.');
                    }
                });
            }
        });
    });
});


module.exports = router;


