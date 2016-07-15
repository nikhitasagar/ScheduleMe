# ScheduleMe Release Notes

## Version 1.0, 4/25/2016

* ScheduleMe currently uses scraped data from Courseoff for its course info,
  which is a result of not being able to obtain access to official course data
  through RNOC before we needed to start development. Eventually ScheduleMe will
  need to be migrated to use Georgia Tech's official data.
* ScheduleMe supports all features as specified in the Detailed Design, except
  for the Distance Between Classes criterion. This criterion proved difficult to
  implement because building names do not match up between Courseoff and the
  RNOC gtplaces API, which is where we would obtain the lat/long data. The GPA
  data from Course Critique has a similar issue with professor names, but to
  a lesser extent that we were able to implement the integration. Switching away
  from Courseoff to RNOC as our data source should allow these criteria to be
  implemented in a robust fashion.
* Course Critique GPA data is taken from CSV dumps in the GitHub repository that
  we loaded into our database. Long-term, we should directly collaborate with
  the Course Critique team to ensure we can obtain the most up-to-date data,
  preferably through an automated process.
* While the scheduling algorithm does consider the weights of the criteria in
  generating schedules, the specific weight system (as described in the code
  comments in `scripts/generate_schedule_algorithm.js`) lacks a solid
  mathematical basis. It may be beneficial to formally evaluate the scoring
  system.
* CAS authentiation in ScheduleMe is currently disabled, because it complicates
  the development process and requires that the web server be run on a computer
  on a Georgia Tech network. CAS can be enabled by following the instructions in
  `README.md` under Using CAS.
