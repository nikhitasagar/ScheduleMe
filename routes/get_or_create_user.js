var express = require('express');
var sqlite3 = require('sqlite3').verbose();
var async = require('async');

var router = express.Router();
var db = new sqlite3.Database('scheduleme.db');

var get_or_create_user_helper = require('../scripts/get_or_create_user_helper');

router.use(function(req, res, next) {
    var username = req.body.username;
    get_or_create_user_helper.execute(username).then(function(result) {
        console.log(JSON.stringify(result));
        res.status(result[0]).send(result[1]);
    });
});

module.exports = router;


