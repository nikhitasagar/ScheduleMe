var sqlite3 = require('sqlite3').verbose();
var async = require('async');
var Q = require('q');

var db = new sqlite3.Database('scheduleme.db');

function execute(username) {
    var deferred = Q.defer();

    async.waterfall([
        function(callback) {
            db.all('select * from user where username = $username;', {
                $username: username
            }, function(err, rows) {
                if (err) {
                    callback(err);
                } else {
                    if (!rows || rows.length === 0) {
                        callback(null);
                    } else {
                        deferred.resolve([200, rows[0]]);
                    }
                }
            });
        },
        function(callback) {
            db.run('insert into user(username) select $username ' +
                'where not exists (select * from user where username = ' +
                '$username);', {
                $username: username,
            }, function(err) {
                if (err) {
                    callback(err);
                } else {
                    var newUserObj = {
                        'user_id': this.lastID,
                        'username': username,
                    };
                    deferred.resolve([201, newUserObj]);
                }
            });
        }
    ], function (err) {
        deferred.resolve([500, err]);
    });

    return deferred.promise;
};

module.exports.execute = execute;