var express = require('express');
var sqlite3 = require('sqlite3').verbose();
var request = require('request');
var async = require('async');
var url = require('url');
var Q = require('q');

var router = express.Router();
var db = new sqlite3.Database('scheduleme.db');

router.use(function(req, res, next) {
    var urlParts = url.parse(req.url, true);
    var queryString = urlParts.query;
    var query = queryString['query'];
    
    if (query === undefined) {
        res.send([]);
    }
    
    function getRows() {
        var deferred = Q.defer();
        db.all(query, function(err, rows) {
            deferred.resolve(rows);
        });
        return deferred.promise;
    }
    
    getRows().then(function(rows) {
        res.send(rows);
    });
});

module.exports = router;
