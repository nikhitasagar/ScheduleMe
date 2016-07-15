# ScheduleMe

## Linux Installation Instructions:

* To install sqlite3, open a terminal and type the following command:
* `sudo apt-get install sqlite3`

* To install Node.js, open a terminal and type the following command:	
* `sudo apt-get install nodejs`

* Then install the node package manager, npm:	
* `sudo apt-get install npm`

* Create a symbolic link for node, as many Node.js tools use this name to execute.
(Failing to execute this step may result in node-sqlite3 installation errors.)
* `sudo ln -s /usr/bin/nodejs /usr/bin/node`

* Install Node.js https://nodejs.org
* `npm install -g bower grunt-cli`

## Every time you pull changes:

* `npm install`
* `bower install`
* `grunt` (TODO: use `grunt` to execute the previous two commands as well)

## Running

ScheduleMe can be started using `node index.js` or `npm start` (both are
equivalent). 

## Structure

* `public/`: Static files such as JavaScript, images, CSS, fonts, etc. Files
  in this directory are available at `/static/` client-side.
  * `js/`
  * `css/`
  * `images/`
  * `lib/`: 3rd-party library files. This folder should be modified only
    by `Gruntfile.js`, which is executed using `grunt` and copies the necessary
    files from `bower_components`.
* `routes/`: Instead of assigning all routes in `index.js`, create a router
for each part of the application in separate files here and then
mount them in `index.js`. See how CAS works for an example.
* `scripts/`: Development utilities.
* `partials/`: Application pages to be sandwiched between the `index.html` 
template page. This is managed by AngularJS. 
* `index.html`: Contains the header and footer html code. 

## Using CAS

CAS authentication only works with `gatech.edu` subdomains. Thankfully, every
computer on Georgia Tech's network is assigned a domain name. Running
`node scripts/dns.js` will print all `gatech.edu` subdomains currently
assigned to your computer. Use these instead of `localhost` or `127.0.0.1`.
If you're not on a Georgia Tech network, you can either VPN into it or
temporarily disable CAS by commenting out the line `app.use('/*', cas);`
in `index.js`.

CAS code is adapted from https://github.gatech.edu/gtjourney/express-casify.

## Misc
* Do not delete the database (scheduleme.db). It is not easy to repopulate the
  database (because in Windows, etc. CourseOff will reset the connection). The
  only way to get around that is to run the init_db.js script from within Linux
  OS (a virtual OS does not work). Not to mention that there is so much
  registration data that it takes several minutes to complete the process.

### Adding packages

* Pass the `-S` flag to `npm install ...` to save the package as an application
  dependency in `package.json`.
* Pass the `-D` flag to `npm install ...` to save the package as a development
  dependency in `package.json` (e.g., grunt modules).
