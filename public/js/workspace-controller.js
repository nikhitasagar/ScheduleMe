var scheduleMeApp = angular.module('ScheduleMeApp');

/*
 * Controller for validating and responding to user actions on the workspace
 * screen.
 */
scheduleMeApp.controller('WorkspaceController', ['$location', '$scope', '$http',
    'LocalStorage', 'ClassHttpService', 'SemesterHttpService', 'ScheduleHttpService',
    function($location, $scope, $http, localStorage, classHttpService,
        semesterHttpService, scheduleHttpService) {
    init(localStorage, $scope);

    $scope.addTimeslot = function() {
        $scope.criteria.timeslots.push({});
    };


    // Click on the lock (or star) symbol, tags that respective class as
    // mandatory -- meaning that it must appear within the list of
    // generated schedules.
    $scope.updateClassMandatoryStatus = function(_class, listName) {
        var list = (listName === 'selectedClasses') ? $scope.selectedClasses : 
            (listName === 'selectedGroups') ? $scope.selectedGroups : null;
            index = (list !== null) ? list.indexOf(_class) : -1;
        if (index !== -1) {
            list[index].isMandatory = !list[index].isMandatory;
            localStorage.set(listName, list);
        }
    };

    // Clicking on the "x" removes the class from the list of selected classes.
    $scope.undoSelection = function(_class, listName) {
        var list = (listName === 'selectedClasses') ? $scope.selectedClasses : 
            (listName === 'selectedGroups') ? $scope.selectedGroups : null;
            index = (list !== null) ? list.indexOf(_class) : -1;
        if (index !== -1) {
            list.splice(index, 1);
            localStorage.set(listName, list);
        }
    };

    // This function might be long but is fairly self-explanatory: it converts
    // the criteria the user set up into a format that is accepted by 
    // generate_schedule_algorithm.js -- i.e. the ScheduleMe algorithm.
    $scope.generateSchedule = function() {
        localStorage.set('previousWorkspacePage', $location.path());
        var classGroups = [];
        var lockedClassGroups = [];
        var lockedSections = [];
        var classGroupID = 0;
        for (var i = 0; $scope.selectedClasses && i < $scope.selectedClasses.length; i++) {
            var group = {
                'class_group_id': classGroupID++,
                'classes': []
            };
            group['classes'].push($scope.selectedClasses[i]['class_id']);
            classGroups.push(group);
            if ($scope.selectedClasses[i]['isMandatory'] === true) {
                lockedClassGroups.push($scope.selectedClasses[i]['class_id']);
            }
            if ($scope.selectedClasses[i]['crn'] && 
                $scope.selectedClasses[i]['crn'] !== 'Any') {
                lockedSections.push($scope.selectedClasses[i]['crn']);
            }
        }

        for (var i = 0; $scope.selectedGroups && i < $scope.selectedGroups.length; i++) {
            var group = {
                'class_group_id': classGroupID++,
                'classes': []
            };
            for (var j = 0; j < $scope.selectedGroups[i].length; j++) {
                var _class = $scope.selectedGroups[i][j];
                group.classes.push(_class['class_id']);
                if (_class['crn'] && _class['crn'] !== 'Any') {
                    lockedSections.push(_class['crn']);
                }
            }
            classGroups.push(group);
        }

        var criteria = [];

        criteria.push({
            'type': 'credits',
            'parameters': [ 
                $scope.criteria.creditsSlider.min, 
                $scope.criteria.creditsSlider.max 
            ],
            'priority': 'required'
        });

        if ($scope.criteria.earliestTime && $scope.criteria.latestTime) {
            var startTime = convertDateToTimeStr($scope.criteria.earliestTime),
                endTime = convertDateToTimeStr($scope.criteria.latestTime);
            criteria.push({
                'type': 'timeofday',
                'parameters': { 
                    'start_time': startTime, 
                    'end_time': endTime
                },
                'priority': $scope.criteria.timeofday.priority
            });
        }

        if ($scope.criteria.timeslots.length > 0) {
            for (var i = 0; i < $scope.criteria.timeslots.length; i++) {
                var timeslot = $scope.criteria.timeslots[i];
                var startTime = (timeslot.type === 'allday') ? '00:00' : timeslot.start;
                var endTime =  (timeslot.type === 'allday') ? '23:59' : timeslot.end;
                criteria.push({
                    'type': 'timeslot',
                    'parameters': { 
                        'day_of_week': timeslot.day, 
                        'start_time': startTime, 
                        'end_time': endTime 
                    },
                    'priority': 'required'
                });
            }
        }


        var scheduleInput = {
            'class_groups': classGroups,
            'locked_class_groups': lockedClassGroups,
            'locked_sections': lockedSections,
            'criteria': criteria
        };

        $location.path('/loading');

        scheduleHttpService.generateSchedule(scheduleInput).then(
            function successCallback(tempScheduleData) {
                localStorage.set('tempScheduleCount', 0);
                localStorage.set('tempScheduleData', tempScheduleData);
                $location.path('/schedule-select');
            }, 
            function failCallback() {
                $location.path('/workspace');
            }
        );
    };

    $scope.$watch(function() {
        return localStorage.get('selectedClasses');
    }, function(newValue, oldValue) {
        $scope.selectedClasses = newValue;
    }, true);

    $scope.$watch(function() {
        return localStorage.get('selectedGroups');
    }, function(newValue, oldValue) {
        $scope.selectedGroups = newValue;
    }, true);
}]);

function init(localStorage, $scope) {
    var totalCredits = 0, 
        selectedClasses = localStorage.get('selectedClasses');
    if (selectedClasses) {
        for (var i = 0; i < selectedClasses.length; i++) {
            var credits = parseInt(selectedClasses[i]['credits']);
            totalCredits += credits;
        }
        if (isNaN(totalCredits)) {
            totalCredits = 15;
        }
    } else {
        totalCredits = 15;
    }
    $scope.criteria = {
        gpaSlider: {
            value: 3.0,
            options: {
                floor: 1.0,
                ceil: 4.0,
                step: 0.1,
                precision: 1,
                showSelectionBarEnd: true
            }
        },
        creditsSlider: {
            min: 6,
            max: Math.max(totalCredits, 6),
            options: {
                floor: 1,
                ceil: 25,
                step: 1,
                noSwitching: true,
                translate: function(value, sliderId, label) {
                    switch (label) {
                        case 'model':
                            return '<b>Min:</b> ' + value;
                        case 'high':
                            return '<b>Max:</b> ' + value;
                        default:
                            return value;
                    }
                }
            }
        },
        timeslots: [],
        timeofday: {
            priority: 'required'
        },
        timebetween: {
            priority: 'required'
        },
        avggpa: {
            priority: 'required'
        },
        distance: {
            priority: 'required'
        }
    };
};

function convertDateToTimeStr(date) {
    var hours = (date.getHours() < 10) ? '0' + date.getHours() : date.getHours(),
        minutes = (date.getMinutes() < 10) ? '0' + date.getMinutes() : date.getMinutes();
    return hours + ':' + minutes;
};
