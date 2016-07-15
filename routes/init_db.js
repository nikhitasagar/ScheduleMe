var express = require('express');
var sqlite3 = require('sqlite3').verbose();
var request = require('request');
var Q = require('q');

var router = express.Router();
var db = new sqlite3.Database('scheduleme.db');

/* 
 * This script can be run from /#/courseoff
 * This script is incredibly hacky. As of current testing, it can only be
 * run within Linux (not a Linux virtual OS -- Linux itself) with a moderate
 * rate of success, since CourseOff resets the connection due to thousands
 * of GET requests being sent to their server. The script, in theory, works.
 * This is the most roundabout, inefficient way of re-creating the data 
 * within a databse. Ideally, we should be using a database dump file of
 * Georgia Tech's registration data or we should be given access to GT's
 * registration API via RNOC. This is a last resort solution that is a lot
 * more complicated than necessary just to get the data that we need.
 */
router.use(function(req, res, next) {
    var CURRENT_TERM = req.term.trim();
    if (!CURRENT_TERM) res.status(400).send('Must provide term, i.e. 201601');
    console.log(CURRENT_TERM);

    db.serialize(function() {
        // Create the database tables that our application requires if the
        // tables have not yet been created.
        db.run("CREATE TABLE if not exists USER(" +
            "user_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL," +
            "username VARCHAR(30) NOT NULL UNIQUE ON CONFLICT IGNORE);")
          .run("CREATE TABLE if not exists SCHEDULE(" +
            "schedule_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL," +
            "user_id INTEGER NOT NULL," +
            "semester_id INTEGER NOT NULL," +
            "foreign key (user_id) references USER(user_id)," +
            "foreign key (semester_id) references SEMESTER(semester_id));")
          .run("CREATE TABLE if not exists SEMESTER(" +
            "semester_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL," +
            "year INTEGER NOT NULL," +
            "term VARCHAR(8) NOT NULL," +
            "UNIQUE(year, term) ON CONFLICT IGNORE);")
          .run("CREATE TABLE if not exists CLASS(" +
            "class_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL," +
            "class_name VARCHAR(255) NOT NULL," +
            "department VARCHAR(10) NOT NULL," +
            "class_number INTEGER NOT NULL," +
            "semester_id INTEGER NOT NULL," +
            "foreign key (semester_id) references SEMESTER(semeter_id)," +
            "UNIQUE(department, class_number) ON CONFLICT IGNORE);")
          .run("CREATE TABLE if not exists SECTION(" +
            "section_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL," +
            "crn INTEGER NOT NULL," +
            "section_name VARCHAR(5) NOT NULL," +
            "credits INTEGER NOT NULL," +
            "professor VARCHAR(255)," +
            "seat_capacity INTEGER," +
            "seat_actual INTEGER," +
            "seat_remaining INTEGER," +
            "class_id INTEGER NOT NULL," +
            "foreign key (class_id) references CLASS(class_id)," +
            "UNIQUE (class_id, crn) ON CONFLICT IGNORE);")
          .run("CREATE TABLE if not exists TIMESLOT(" +
            "timeslot_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL," +
            "location VARCHAR(255)," +
            "start_time VARCHAR(30)," +
            "end_time VARCHAR(30)," +
            "day_of_week VARCHAR(10)," +
            "section_id INTEGER NOT NULL," +
            "foreign key (section_id) references SECTION(section_id)," +
            "UNIQUE(location, start_time, end_time, day_of_week) ON CONFLICT IGNORE);")
          .run("CREATE TABLE if not exists SECTIONSCHEDULE(" +
            "section_schedule_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL," +
            "schedule_id INTEGER NOT NULL," +
            "section_id INTEGER NOT NULL," +
            "timeslot_id INTEGER NOT NULL," +
            "foreign key (schedule_id) references SCHEDULE(schedule_id)," +
            "foreign key (section_id) references SECTION(section_id)," +
            "foreign key (timeslot_id) references TIMESLOT(timeslot_id));");
    });

    var semesters = [];
    var courses = [];
    var sections = [];
    var timeslots = [];

    // Only gets data for one term or semester at a time -- trust me, it takes
    // long enough to run this script as is (~2 - 5 minutes).
    getSemesters(CURRENT_TERM).then(function(semestersResponse) {
        semesters = semestersResponse;
        console.log('Retrieved semesters.');
        getCourses(semesters).then(function(coursesResponse) {
            courses = coursesResponse;
            console.log('Retrieved courses.');
            var sectionsAndTimeslots = extractSectionsAndTimeslotsFromCourses(courses);
            console.log('Retrieved sections/timeslots.');
            sections = sectionsAndTimeslots[0];
            timeslots = sectionsAndTimeslots[1];
            insertIntoDB(semesters, courses, sections, timeslots).then(function() {
                console.log('Done');
                res.status(200).send('Done running script. Check DB for data.');
            });
        });
    });
});

module.exports = router;

function insertIntoDB(semesters, courses, sections, timeslots) {
    var mainDefer = Q.defer();

    db.parallelize(function() {
        var deferredCount;

        saveSemesters(semesters).then(function() {
            console.log('Done inserting semesters into DB.');
            return getFKsForCourses(courses);
        }).then(function(finalCourses) {
            return saveCourses(finalCourses);
        }).then(function() {
            console.log('Done inserting courses into DB.');
            return getFKsForSections(sections);
        }).then(function(finalSections) {
            return saveSections(finalSections);
        }).then(function() {
            console.log('Done inserting sections into DB.');
            return getFKsForTimeslots(timeslots);
        }).then(function(finalTimeslots) {
            return saveTimeslots(finalTimeslots);
        }).then(function() {
           console.log('Done inserting timeslots into DB.');
           mainDefer.resolve();
        });
    });

    // This entire script is an async nightmare. When sqlite3 is saving records,
    // it's basically busy. It doesn't matter if node.js is ready to do other things:
    // if sqlite3 is busy, it'll throw an error. This function basically keeps asking
    // the question to sqlite3: "Are you done saving the several thousand records
    // that I asked you to save?" It asks this question every 100ms, until the answer
    // is "Yes". At that point, the next bulk of records may be saved.
    function waitForAllRecordsToSave(deferred) {
        if (deferredCount === 0) {
            deferred.resolve();
        } else {
            setTimeout(waitForAllRecordsToSave, 100, deferred);
        }
    };

    function saveSemesters(semesters) {
        var deferred = Q.defer();
        var query = db.prepare("INSERT INTO semester(year, term) values(?, ?);");
        deferredCount = semesters.length;

        for (var i = 0; i < semesters.length; i++) {
            var semester = semesters[i];
            query.run([
                semester['year'], semester['term']
            ], function(error) {
                deferredCount -= 1;
            });
        }

        waitForAllRecordsToSave(deferred);
        return deferred.promise;
    };

    // These "getFKs" functions are required because nested select statements
    // aren't supported by sqlite3 or simply don't work with node-sqlite3. 
    function getFKsForCourses(courses) {
        var deferred = Q.defer();
        var coursesWithSemesterIDs = [];
        var coursePromises = [];

        for (var i = 0; i < courses.length; i++) {
            var course = courses[i];
            var innerQuery = "SELECT semester_id FROM semester WHERE year = '" +
                course["semester"]["year"] + "' AND term = '" +
                course["semester"]["term"] + "' LIMIT 1;";
            var promise = executeInnerQuery(innerQuery, course, 'semester_id',
                'semester').then(function(finalCourse) {
                coursesWithSemesterIDs.push(finalCourse);
            });
            coursePromises.push(promise);
        }

        Q.all(coursePromises).then(function() {
            deferred.resolve(coursesWithSemesterIDs);
        });

        return deferred.promise;
    };

    function saveCourses(finalCourses) {
        var deferred = Q.defer();
        var statement = db.prepare("INSERT INTO class(class_name, department, " +
            "class_number, semester_id) VALUES(?, ?, ?, ?);");
        deferredCount = finalCourses.length;

        for (var i = 0; i < finalCourses.length; i++) {
            var course = finalCourses[i];
            statement.run([
                course['class_name'], course['department'], course['class_number'],
                course['semester_id']
            ], function(error) {
                deferredCount -= 1;
            });
        }

        waitForAllRecordsToSave(deferred);
        return deferred.promise;
    };

    function getFKsForSections(sections) {
        var deferred = Q.defer();
        var sectionsWithClassIDs = [];
        var sectionPromises = [];

        for (var i = 0; i < sections.length; i++) {
            var section = sections[i];
            var innerQuery = "SELECT class_id FROM class where class_number = '" +
                section['class_number'] + "' AND department = '" + section['department'] +
                "' LIMIT 1;";
            var promise = executeInnerQuery(innerQuery, section, 'class_id',
                'class_number', true).then(function(finalSection) {
                sectionsWithClassIDs.push(finalSection);
            });
            sectionPromises.push(promise);
        }

        Q.all(sectionPromises).then(function() {
            deferred.resolve(sectionsWithClassIDs);
        });

        return deferred.promise;
    };

    function saveSections(finalSections) {
        var deferred = Q.defer();
        var query = db.prepare("INSERT INTO section(crn, credits, professor, section_name, class_id, " +
            "seat_capacity, seat_actual, seat_remaining) VALUES(?, ?, ?, ?, ?, ?, ?, ?);");
        deferredCount = finalSections.length;

        for (var i = 0; i < finalSections.length; i++) {
            var section = finalSections[i];
            query.run([
                section['crn'], section['credits'], section['professor'],
                section['section_name'], section['class_id'], section['seat_capacity'],
                section['seat_actual'], section['seat_remaining']
            ], function(error) {
                deferredCount -= 1;
            });
        }

        waitForAllRecordsToSave(deferred);
        return deferred.promise;
    };

    function getFKsForTimeslots(timeslots) {
        var deferred = Q.defer();
        var timeSlotsWithSelectionIDs = [];
        var timeSlotPromises = [];

        for (var i = 0; i < timeslots.length; i++) {
            var timeslot = timeslots[i];
            var innerQuery = "SELECT section_id FROM section where crn = '" +
                timeslot['section_crn'] + "' LIMIT 1;";
            var promise = executeInnerQuery(innerQuery, timeslot, 'section_id',
                'section_crn').then(function(finalTimeslot) {
                timeSlotsWithSelectionIDs.push(finalTimeslot);
            });
            timeSlotPromises.push(promise);
        }

        Q.all(timeSlotPromises).then(function() {
            deferred.resolve(timeSlotsWithSelectionIDs);
        });

        return deferred.promise;
    };

    function saveTimeslots(finalTimeslots) {
        var deferred = Q.defer();
        var query = db.prepare("INSERT INTO timeslot(location, start_time, end_time, " +
            "day_of_week, section_id) VALUES(?, ?, ?, ?, ?);");
        deferredCount = finalTimeslots.length;

        for (var i = 0; i < finalTimeslots.length; i++) {
            var timeslot = finalTimeslots[i];
            var location = timeslot['location'];
            var startTime = timeslot['start_time'];
            var endTime = timeslot['end_time'];
            var dayOfWeek = timeslot['day_of_week'];
            var sectionID = timeslot['section_id'];
            query.run([
                location, startTime, endTime, dayOfWeek, sectionID
            ], function(error) {
                deferredCount -= 1;
            });
        }

        waitForAllRecordsToSave(deferred);
        return deferred.promise;
    };

    return mainDefer.promise;
};

// Used to essentially execute queries that would otherwise be injected into
// an inner select statement inside a nested select statement. Stuff like this
// isn't needed by most languages, but we're talking about node.js here...
function executeInnerQuery(innerQuery, obj, key, deleteKey, print) {
    var deferred = Q.defer();
    var finalObj = JSON.parse(JSON.stringify(obj));

    db.all(innerQuery, function(err, rows) {
        if (rows.length > 0) {
            var row = rows[0];
            if (row[key] !== undefined) {
                finalObj[key] = row[key];
            } else {
                finalObj[key] = "null";
            }
            if (deleteKey) {
                delete finalObj[deleteKey];
            }
        }
        deferred.resolve(finalObj);
    });

    return deferred.promise;
};

function getSemesters(term) {
    var url = "https://soc.courseoff.com/gatech/terms/";
    if (term) {
        url += term;
    }

    var deferred = Q.defer();
    var finalSemesters = [];
    var finalMajors = [];

    httpGet(url).then(function(jsonResponse) {
        finalSemesters = getSemestersCallback(jsonResponse);
        getMajorsCallback(finalSemesters).then(function(majorsResponse) {
            finalMajors = majorsResponse;
            combineCoursesWithSemestersCallback(finalSemesters, finalMajors).then(function() {
                deferred.resolve(finalSemesters, finalMajors);
            });
        });
    });

    function getSemestersCallback(jsonResponse) {
        var semesters = [];

        if (typeof jsonResponse == 'array') {
            for (var i = 0; i < jsonResponse.length; i++) {
                var semester = jsonResponse[i];
                var courseOffTerm = semester['ident'].toString();
                var year = courseOffTerm.substring(0, 4);
                year = parseInt(year);
                var term = semester['semester'];
                semesters[i] = {'year': year, 'term': term, 'courseOffTerm': courseOffTerm};
            }
        } else if (typeof jsonResponse == 'object') {
            var courseOffTerm = jsonResponse['ident'].toString();
            var year = courseOffTerm.substring(0, 4);
            year = parseInt(year);
            var term = jsonResponse['semester'];
            semesters[0] = {'year': year, 'term': term, 'courseOffTerm': courseOffTerm};
        }

        return semesters;
    }

    function getMajorsCallback(semesters) {
        var innerDefer = Q.defer();
        var majors = [];
        var majorPromises = [];

        for (var i = 0; i < semesters.length; i++) {
            var courseOffTerm = semesters[i]['courseOffTerm'];
            var promise = getMajorsByTerm(courseOffTerm).then(function(termMajors) {
                majors = majors.concat(termMajors);
            });
            majorPromises.push(promise);
        }

        Q.all(majorPromises).then(function() {
           innerDefer.resolve(majors);
        });

        return innerDefer.promise;
    };

    function combineCoursesWithSemestersCallback(semesters, majors) {
        var innerDefer = Q.defer();
        var coursesbySemesterPromises = [];

        for (var i = 0; i < semesters.length; i++) {
            var semester = semesters[i];
            var promise = getCoursesCallbackInner(semester, majors).then(function(coursesBySemester) {
                semester['courses'] = coursesBySemester;
            });
            coursesbySemesterPromises.push(promise);
        }

        Q.all(coursesbySemesterPromises).then(function() {
           innerDefer.resolve();
        });

        function getCoursesCallbackInner(semester, majors) {
            var subDefer = Q.defer();
            var coursesByMajor = [];
            var coursesByMajorPromises = [];

            for (var j = 0; j < majors.length; j++) {
                var major = majors[j];
                var term = semester['courseOffTerm'];
                var subPromise = getCoursesByTermAndMajor(term, major).then(
                    function(coursesByMajorResponse) {
                    coursesByMajor = coursesByMajor.concat(coursesByMajorResponse);
                });
                coursesByMajorPromises.push(subPromise);
            }

            Q.all(coursesByMajorPromises).then(function() {
               subDefer.resolve(coursesByMajor);
            });

            return subDefer.promise;
        };

        return innerDefer.promise;
    };

    return deferred.promise;
};

/* Get all course information for each course contained in each semester. */
function getCourses(semesters) {
    var deferred = Q.defer();
    var finalCourses = [];
    var coursePromises = [];

    for (var i = 0; i < semesters.length; i++) {
        var promise = courseCallback(semesters[i]).then(
            function(courseResponse) {
            finalCourses.push(courseResponse);
        });
        coursePromises.push(promise);
        delete semesters[i]['courses'];
    }

    function courseCallback(semester) {
        var innerDiffer = Q.defer();
        var coursesBySemester = semester['courses'];
        var term = semester['courseOffTerm'];
        var innerCourses = [];
        var innerPromises = [];

        for (var j = 0; j < coursesBySemester.length; j++) {
            var course = coursesBySemester[j];
            var innerPromise = getCourseSectionsForCourse(term, course).then(
                function(courseWithSections) {
                courseWithSections['semester'] = semester;
                innerCourses.push(courseWithSections);
            });
            innerPromises.push(innerPromise);
        }

        Q.all(innerPromises).then(function() {
           deferred.resolve(innerCourses);
        });

        return innerDiffer.promise;
    };

    Q.all(coursePromises).then(function() {
        deferred.resolve(finalCourses);
    });

    return deferred.promise;
};

function extractSectionsAndTimeslotsFromCourses(courses) {
    var finalSections = [];
    var finalTimeslots = [];

    for (var i = 0; i < courses.length; i++) {
        var sections = courses[i]['sections'];
        for (var j = 0; j < sections.length; j++) {
            var section = sections[j];
            section['class_number'] = courses[i]['class_number'];
            section['department'] = courses[i]['department'];
            if (finalSections.indexOf(section) === -1) {
                finalSections.push(section);
            }
        }
    }

    for (var i = 0; i < finalSections.length; i++) {
        var timeslots = finalSections[i]['timeslots'];
        for (var j = 0; j < timeslots.length; j++) {
            var timeslot = timeslots[j];
            timeslot['section_crn'] = finalSections[i]['crn'];
            if (finalTimeslots.indexOf(timeslot) === -1) {
                finalTimeslots.push(timeslot);
            }
        }
        delete finalSections[i]['timeslots'];
    }

    return [finalSections, finalTimeslots];
};

/* Helper function for getSemesters().
 * Gets all majors by term.
 * Accepted terms are of form "201601" for example.
 */
function getMajorsByTerm(term) {
    var deferred = Q.defer();
    var url = "https://soc.courseoff.com/gatech/terms/" + term + "/majors/";

    httpGet(url).then(function(jsonResponse) {
        var majors = [];
        for (var i = 0; i < jsonResponse.length; i++) {
            var major = jsonResponse[i];
            var majorAbbreviation = major['ident'];
            majors.push(majorAbbreviation);
        }
        deferred.resolve(majors);
    });

    return deferred.promise;
};

/* Helper function for getSemesters().
 * Get all courses by term and major.
 * Accepted terms are of form "201601" for example.
 * Accepted majors are of form "CS" or "ACC" for example.
 */
function getCoursesByTermAndMajor(term, major) {
    var deferred = Q.defer();
    var url = "https://soc.courseoff.com/gatech/terms/" + term + "/majors/"
        + major + "/courses";
    var courses = [];

    httpGet(url).then(function(jsonResponse) {
        for (var i = 0; i < jsonResponse.length; i++) {
            var course = {};
            course['class_number'] = jsonResponse[i]['ident'];
            course['class_name'] = jsonResponse[i]['name'];
            course['department'] = major;
            courses.push(course);
        }
        deferred.resolve(courses);
    });

    return deferred.promise;
};

/* Grabs all specific course info per course, including timeslots
 * associated with each course.
 */
function getCourseSectionsForCourse(term, course) {
    var deferred = Q.defer();
    var major = course['department'];
    var number = course['class_number'];
    var url = "https://soc.courseoff.com/gatech/terms/" + term +
        "/majors/" + major + "/courses/" + number + "/sections";
    var sections = [];

    httpGet(url).then(function(jsonResponse) {
        for (var i = 0; i < jsonResponse.length; i++) {
            var section = jsonResponse[i];
            var sectionFinal = {};
            sectionFinal['credits'] = section['credits'];
            sectionFinal['crn'] = section['call_number'];
            sectionFinal['section_name'] = section['ident'];
            sectionFinal['professor'] = (section['instructor']) ?
                section['instructor']['lname'].trim() + ', ' +
                section['instructor']['fname'].trim() : null;
            sectionFinal['seat_capacity'] = (section['seats']) ?
                section['seats']['capacity'] : null;
            sectionFinal['seat_actual'] = (section['seats']) ?
                section['seats']['actual'] : null;
            sectionFinal['seat_remaining'] = (section['seats']) ?
                section['seats']['remaining'] : null;
            var timeslots = [];
            for (var j = 0; j < section['timeslots'].length; j++) {
                var timeslot = section['timeslots'][j];
                var timeslotFinal = {};
                timeslotFinal['location'] = timeslot['location'];
                timeslotFinal['start_time'] = formatTime(timeslot['start_time']);
                timeslotFinal['end_time'] = formatTime(timeslot['end_time']);
                timeslotFinal['day_of_week'] = timeslot['day'];
                timeslots.push(timeslotFinal);
            }
            sectionFinal['timeslots'] = timeslots;
            sections.push(sectionFinal);
        }
        course['sections'] = sections;
        deferred.resolve(course);
    });

    return deferred.promise;
};

/* Helper method that converts time from minutes to 24-hour formatted
 * time. (CourseOff stores time in minutes.)
 */
function formatTime(time) {
    formatted = "";

    var hours = Math.floor(time / 60);
    var minutes = time % 60;
    hours = hours.toString();
    minutes = minutes.toString();

    if (hours.length == 1) {
        hours = "0" + hours;
    }

    if (minutes.length == 1) {
        minutes = "0" + minutes;
    }

    formatted = hours + ":" + minutes;

    return formatted;
};

function httpGet(theUrl) {
    var deferred = Q.defer();

    request(theUrl, function(error, response, body) {
        deferred.resolve(JSON.parse(body));
    });

    return deferred.promise;
};