var os = require('os');
var dns = require('dns');

var nics = os.networkInterfaces();

Object.keys(nics).forEach(function(nicId) {
    nics[nicId].forEach(function(address) {
        if (!address['internal']
                && address['family'] == 'IPv4'
                && address['mac'] != '00:00:00:00:00:00') {
            dns.reverse(address['address'], function(err, ipNames) {
                if (ipNames) {
                    ipNames.forEach(function(ipName) {
                        if (ipName.endsWith('gatech.edu')) {
                            console.log(ipName);
                        }
                    });
                }
            });
        }
    });
});
