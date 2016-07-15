var async = require('async');
var Q = require('q');

function execute(transaction, section_id, schedule_id) {
    var deferred = Q.defer();

    async.waterfall([
        function getTimeslotsBySectionID(callback) {
            transaction.all('select * from timeslot where section_id = $section_id;', {
                $section_id: section_id
            }, function(err, rows) {
                callback(err, rows);
            });    
        },
        function getScheduleSectionsByWeekday(timeslots, callback) {
            var days_of_week = [];
            for (var i = 0; i < timeslots.length; i++) {
                if (days_of_week.indexOf(timeslots[i]['day_of_week']) === -1) {
                    days_of_week.push("'" + timeslots[i]['day_of_week'] + "'");
                }
            }
            transaction.all('select ts.day_of_week, ts.start_time, ts.end_time from sectionschedule ss ' +
                'inner join timeslot ts on (ss.timeslot_id = ts.timeslot_id) where ts.day_of_week ' +
                'in (' + days_of_week.toString() + ') and ss.schedule_id = ' + schedule_id + ';', 
                function(err, rows) {
                    callback(err, timeslots, rows);
                }
            );
        }, 
        function checkForTimeConflicts(timeslots, section_schedules, callback) {
            var haveConflict = false;
            var error = 'Error: could not insert section_id: ' + 
                section_id + ' into schedule_id: ' + schedule_id + 
                ' because time conflict exists.';
            
            for (var i = 0; haveConflict === false && i < section_schedules.length; i++) {
                var section_schedule = section_schedules[i];
                for (var j = 0; haveConflict === false && j < timeslots.length; j++) {
                    var timeslot = timeslots[j];
                    if (timeslot['day_of_week'] === section_schedule['day_of_week']) {
                        var hour = timeslot['start_time'].substring(
                            0, timeslot['start_time'].indexOf(':')
                        );
                        var min = timeslot['start_time'].substring(
                            timeslot['start_time'].indexOf(':') + 1
                        );
                        var newStartTime = new Date(0, 0, 0, hour, min, 0, 0);
                        hour = section_schedule['start_time'].substring(
                            0, section_schedule['start_time'].indexOf(':')
                        );
                        min = section_schedule['start_time'].substring(
                            section_schedule['start_time'].indexOf(':') + 1
                        );
                        var currStartTime = new Date(0, 0, 0, hour, min, 0, 0);
                        hour = timeslot['end_time'].substring(
                            0, timeslot['end_time'].indexOf(':')
                        );
                        min = timeslot['end_time'].substring(
                            timeslot['end_time'].indexOf(':') + 1
                        );
                        var newEndTime = new Date(0, 0, 0, hour, min, 0, 0);
                        hour = section_schedule['end_time'].substring(
                            0, section_schedule['end_time'].indexOf(':')
                        );
                        min = section_schedule['end_time'].substring(
                            section_schedule['end_time'].indexOf(':') + 1
                        );
                        var currEndTime = new Date(0, 0, 0, hour, min, 0, 0);
                        
                        if (newStartTime < currStartTime) {
                            if (newEndTime > currStartTime) {
                                haveConflict = true;
                            }
                        } else {
                            if (newStartTime < currEndTime) {
                                haveConflict = true;
                            }
                        }
                    } 
                }
            }
            if (haveConflict === true) {
                callback(error, null, null);
            } else {
                callback(null, haveConflict, timeslots);
            }
        }, 
        function insertAllIntoDB(haveConflict, timeslots, callback) {
            var promises = [];
            for (var i = 0; i < timeslots.length; i++) {
                promises.push(
                    insertSingleIntoDB(transaction, schedule_id, section_id, 
                        timeslots[i]['timeslot_id'])
                );
            }
            Q.all(promises).then(function() {
                callback(null);
            });
        }
    ], function(err) {
        if (err) {
            deferred.resolve([500, err]);
        } else {
            deferred.resolve([201, 'Successfully added new section to schedule.']);
        }
    });

    return deferred.promise;
};

function insertSingleIntoDB(transaction, schedule_id, section_id, timeslot_id) {
    var deferred = Q.defer();
    transaction.run('insert into sectionschedule(schedule_id, section_id, timeslot_id) ' +
        'select $schedule_id, $section_id, $timeslot_id where not exists (' +
        'select * from sectionschedule where schedule_id = $schedule_id and ' +
        'section_id = $section_id and timeslot_id = $timeslot_id);', {
        $schedule_id: schedule_id,
        $section_id: section_id,
        $timeslot_id: timeslot_id
    }, function(err) {
        deferred.resolve(err);
    });
    return deferred.promise;
};

module.exports.execute = execute;