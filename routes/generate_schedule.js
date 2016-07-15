var express = require('express');
var sqlite3 = require('sqlite3').verbose();
var async = require('async');
var Q = require('q');

var router = express.Router();
var db = new sqlite3.Database('scheduleme.db');

var schedule_generator = require('../scripts/generate_schedule_algorithm');

router.use(function(req, res, next) {
    schedule_generator.find_best_schedules(
        req.body.scheduleInput,
        10,
        function(err, schedules) {
            if (err !== null) {
                return res.status(200).send(err);
            } else {
                generateScheduleDataForSchedules(schedules).then(
                    function(tempScheduleData) {
                        return res.status(200).send(tempScheduleData);
                    }
                );
            }
        }
    );
});

function generateScheduleDataForSchedules(schedules) {
    var deferred = Q.defer();
    var tempScheduleData = [];
    var promises = [];

    for (var i = 0; i < Math.min(10, schedules.length); i++) {
        var promise = generateScheduleDataForSchedule(schedules[i]).then(function(data) {
            if (data) {
                tempScheduleData.push(data);
            }
        });
        promises.push(promise);
    }

    Q.all(promises).then(function() {
        deferred.resolve(tempScheduleData);
    });
    
    return deferred.promise;
};

function generateScheduleDataForSchedule(schedule) {
    var deferred = Q.defer();

    async.waterfall([
        function(callback) {
            var section_ids = JSON.stringify(schedule)
                .replace('[', '(')
                .replace(']', ')');
            var query = "select * from section sect inner join " +
                "class cls on cls.class_id = sect.class_id " +
                "left outer join timeslot ts on ts.section_id = sect.section_id " +
                "where sect.section_id in " + section_ids + 
                " order by sect.section_id, ts.timeslot_id asc;";
            db.all(query, function(err, rows) {
                var rawRows = JSON.parse(JSON.stringify(rows)), 
                    groupedRows = [];
                for (var i = 0; rows && i < rows.length; i++) {
                    rows[i]['isMandatory'] = true;
                    var previouslySeenRow = getRowByVal(groupedRows, rows[i]);
                    if (previouslySeenRow === null) {
                        var dayOfWeek = rows[i]['day_of_week'];
                        var time = {
                            'start_time': rows[i]['start_time'],
                            'end_time': rows[i]['end_time'],
                            'in': []
                        };
                        time['in'].push(dayOfWeek);
                        delete rows[i]['day_of_week'];
                        delete rows[i]['start_time'];
                        delete rows[i]['end_time']
                        rows[i]['days_of_week'] = [];
                        rows[i]['times'] = [];
                        rows[i]['days_of_week'].push(dayOfWeek);
                        rows[i]['times'].push(time);
                        groupedRows.push(rows[i]);
                    } else {
                        var dayOfWeek = rows[i]['day_of_week'];
                        var time = {
                            'start_time': rows[i]['start_time'],
                            'end_time': rows[i]['end_time'],
                            'in': []
                        };
                        time['in'].push(dayOfWeek);
                        previouslySeenRow['days_of_week'].push(dayOfWeek);
                        for (var j = 0; j < previouslySeenRow['times'].length; j++) {
                            var prevTime = previouslySeenRow['times'][j];
                            if (prevTime['start_time'] !== time['start_time'] &&
                                prevTime['end_time'] !== time['end_time']) {
                                previouslySeenRow['times'].push(time);
                            } else if (prevTime['start_time'] === time['start_time'] &&
                                prevTime['end_time'] === time['end_time']) {
                                if (previouslySeenRow['times'][j]['in'].indexOf(dayOfWeek) === -1) {
                                    previouslySeenRow['times'][j]['in'].push(dayOfWeek);
                                }
                            }
                        }
                    }
                }
                if (rawRows.length > 0 && groupedRows.length > 0) {
                    callback(null, {'raw': rawRows, 'grouped': groupedRows});
                } else {
                    callback(null, null);
                }
            });
        }
    ], function (err, data) {
        if (err) {
            deferred.resolve(err);
        } else {
            deferred.resolve(data);
        }
    });

    return deferred.promise;
};


function getRowByVal(groupedRows, row) {
    for (var i = 0; i < groupedRows.length; i++) {
        if (groupedRows[i]['crn'] === row['crn'] &&
            groupedRows[i]['section_name'] === row['section_name']) {
            return groupedRows[i];
        }
    }
    return null;
};

module.exports = router;
