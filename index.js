var express = require('express');
var ehb = require('express-handlebars');
var bodyParser = require('body-parser');
var path = require('path');

var cas = require('./routes/cas');

var init_db = require('./routes/init_db');
var select_db = require('./routes/select_db');

var get_user = require('./routes/get_user');
var get_schedule = require('./routes/get_schedule');
var get_semester = require('./routes/get_semester');
var get_latest_semester = require('./routes/get_latest_semester');
var get_semesters = require('./routes/get_semesters');
var get_classes = require('./routes/get_classes');
var get_sections = require('./routes/get_sections');
var get_timeslots = require('./routes/get_timeslots');
var get_professor_dict = require('./routes/get_professor_dict');

var get_or_create_user = require('./routes/get_or_create_user');
var generate_schedule = require('./routes/generate_schedule');
var create_schedule = require('./routes/create_schedule');
var generate_schedule = require('./routes/generate_schedule');

var update_schedule = require('./routes/update_schedule');

var delete_user = require('./routes/delete_user');
var delete_schedule = require('./routes/delete_schedule');

var app = express();

app.use('/static/css/', express.static(__dirname + '/public/css/'));
app.use('/static/js/', express.static(__dirname + '/public/js/'));
app.use('/static/lib/', express.static(__dirname + '/public/lib/'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get('/user', function(req, res) {
    res.send(req.session ? req.session.username : '');
});

// Everything after this line will require authentication
// app.use('/*', cas);

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
});

// Used for sending back partial html files, which are sandwiched between the
// index.html template
app.get('/partials/:partial_name', function(req, res) {
    res.sendFile(path.join(__dirname, '/partials/', req.params.partial_name));
});

// Init database
app.use('/init/:term', function(req, res, next) {
    req.term = req.params.term;
    init_db(req, res, next);
});

// Test database
app.use('/select', select_db);

// Get user by specified username
app.get('/user/:username', function(req, res, next) {
    req.username = req.params.username;
    get_user(req, res, next);
});

// Get all schedules by specified user id
app.get('/user/:user_id/schedule/:semester_id', function(req, res, next) {
    req.user_id = req.params.user_id;
    req.semester_id = req.params.semester_id;
    get_schedule(req, res, next);
});

// Get latest semester
app.get('/semester/latest', get_latest_semester);

// Get semester by specified semester id
app.get('/semester/:semester_id', function(req, res, next) {
    req.semester_id = req.params.semester_id;
    get_semester(req, res, next);
});

// Get all semesters
app.get('/semesters', get_semesters);

// Get all classes by specified semester id
app.get('/classes/:semester_id', function(req, res, next) {
    req.semester_id = req.params.semester_id;
    get_classes(req, res, next);
});

// Get all sections by specified class id
app.get('/sections/:class_id', function(req, res, next) {
    req.class_id = req.params.class_id;
    get_sections(req, res, next);
});

// Get all timeslots by specified section id
app.get('/timeslots/:section_id', function(req, res, next) {
    req.section_id = req.params.section_id;
    get_timeslots(req, res, next);
});

// Get dict of professors
app.get('/professors', get_professor_dict);

// Get user by username if exists, else create user with username
app.post('/get_or_create_user', get_or_create_user);

// Generate temporary schedules permutations
app.post('/generate_schedule', generate_schedule);

// Create schedule
app.post('/schedule', create_schedule);

// Update schedule
app.put('/schedule/:schedule_id/', 
	function(req, res, next) {
		req.schedule_id = req.params.schedule_id.trim();
		update_schedule(req, res, next);
	}
);

// Delete specified user
app.delete('/user/:user_id', function(req, res, next) {
    req.user_id = req.params.user_id;
    delete_user(req, res, next);
});

// Delete specified schedule
app.delete('/schedule/:schedule_id', function(req, res, next) {
    req.schedule_id = req.params.schedule_id;
    delete_schedule(req, res, next);
});

app.listen(process.env.PORT || 3000, function() {
    console.log("Listening on port " + (process.env.PORT || 3000));
});
