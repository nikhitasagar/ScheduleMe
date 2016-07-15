var express = require('express');
var session = require('express-session');
var https = require('https');
var parseString = require('xml2js').parseString;

var router = express.Router();

var get_or_create_user_helper = require('../scripts/get_or_create_user_helper');

// TODO: use different session store
router.use(session({
    resave: true,
    saveUninitialized: true,
    secret: "cree craw toad's foot geese walk barefoot"
}));

router.use(function(req, res, next) {
    var session = req.session;
    var baseUrl = req.protocol + '://' + req.get('host');

    var encBaseUrl = encodeURIComponent(baseUrl);
    var encTicket = encodeURIComponent(req.query.ticket);

    if (session.username === undefined) {
        if (req.query.ticket === undefined) {
            session.requestedURL = req.url;
            res.redirect(302, 'https://login.gatech.edu/cas/login?service=' + encBaseUrl);
        } else {
            var serviceValidate =
                'https://login.gatech.edu/cas/serviceValidate?service=' +
                encBaseUrl + '&ticket=' + encTicket;
            
            https.get(serviceValidate, function(validateResponse) {
                var body = '';

                validateResponse.on('data', function(chunk) {
                    body += chunk;
                });

                validateResponse.on('end', function() {
                    parseString(body, function(err, result) {
                        if (result !== undefined
                                && result['cas:serviceResponse'] !== undefined) {
                            var successResult =
                                result['cas:serviceResponse']['cas:authenticationSuccess'];
                            if (successResult !== undefined) {
                                session.username = successResult[0]['cas:user'][0];
                                //res.redirect(session.requestedURL);
                                get_or_create_user_helper.execute(session.username).
                                    then(function(result) {
                                    var queryString = '?bypass=true&user_id=' + 
                                        result[1]['user_id'] + '&username=' + 
                                        result[1]['username'];
                                    res.redirect('/#/login' + queryString);
                                });
                                delete session.requestedURL;
                            } else {
                                res.redirect(302,
                                    'https://login.gatech.edu/cas/login?service=' + encBaseUrl);
                            }
                        } else {
                            res.send('Unable to process CAS response');
                        }
                    });
                });
            }).on('error', function(e) {
                res.send('HTTP validation error');
            });
        }
    } else {
        next();
    }
});

module.exports = router;
