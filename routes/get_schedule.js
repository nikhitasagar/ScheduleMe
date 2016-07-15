var express = require('express');
var sqlite3 = require('sqlite3').verbose();
var async = require('async');

var router = express.Router();
var db = new sqlite3.Database('scheduleme.db');

/**
 * Get schedules by user id.
 */
router.use(function(req, res, next) {
    var user_id = req.user_id.trim();
    var semester_id = req.semester_id.trim();

    async.waterfall([
        function(callback) {
            var query = "select * from schedule sch " +
                "inner join sectionschedule ss on ss.schedule_id = sch.schedule_id " +
                "inner join section sect on sect.section_id = ss.section_id " +
                "inner join class cls on cls.class_id = sect.class_id " +
                "left outer join timeslot ts on ts.timeslot_id = ss.timeslot_id " +
                "where sch.user_id = '" + user_id + "' and sch.semester_id = '" +
                semester_id + "' order by ss.schedule_id, ss.section_id, ss.timeslot_id asc;";
            db.all(query, function(err, rows) {
                var dictRows = {},
                    finalRows = [];
                for (var i = 0; rows && i < rows.length; i++) {
                    var scheduleID = rows[i]['schedule_id'];
                    if (dictRows[scheduleID] === undefined) {
                        dictRows[scheduleID] = [];
                    }
                    dictRows[scheduleID].push(rows[i]);
                }
                var semesterIndex = -1;
                for (var scheduleID in dictRows) {
                    semesterIndex++;
                    if (finalRows[semesterIndex] === undefined) {
                        finalRows[semesterIndex] = {
                            'raw': [],
                            'grouped': []
                        }
                    }
                    for (var i = 0; i < dictRows[scheduleID].length; i++) {
                        var classData = dictRows[scheduleID][i];
                        finalRows[semesterIndex]['raw']
                            .push(JSON.parse(JSON.stringify(classData)));
                        classData['isMandatory'] = true;
                        var previouslySeenRow = getRowByVal(
                            finalRows[semesterIndex]['grouped'], classData
                        );
                        if (previouslySeenRow === null) {
                            var dayOfWeek = classData['day_of_week'];
                            var time = {
                                'start_time': classData['start_time'],
                                'end_time': classData['end_time'],
                                'in': []
                            };
                            time['in'].push(dayOfWeek);
                            delete classData['day_of_week'];
                            delete classData['start_time'];
                            delete classData['end_time']
                            classData['days_of_week'] = [];
                            classData['times'] = [];
                            classData['days_of_week'].push(dayOfWeek);
                            classData['times'].push(time);
                            finalRows[semesterIndex]['grouped'].push(classData);
                        } else {
                            var dayOfWeek = classData['day_of_week'];
                            var time = {
                                'start_time': classData['start_time'],
                                'end_time': classData['end_time'],
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
                }
                callback(null, finalRows);
            });
        }
    ], function (err, scheduleData) {
        if (scheduleData && scheduleData.length > 0) {
            res.status(200).send(scheduleData);
        } else {
            res.status(204).send('No schedule for current user.');
        }
    });
});

function getRowByVal(groupedRows, classData) {
    for (var i = 0; i < groupedRows.length; i++) {
        if (groupedRows[i]['crn'] === classData['crn'] &&
            groupedRows[i]['section_name'] === classData['section_name']) {
            return groupedRows[i];
        }
    }
    return null;
};

module.exports = router;