var scheduleMeApp = angular.module('ScheduleMeApp');

/*
 * Controller for updating the display of the navigation bar at the top of
 * the application.
 */
scheduleMeApp.controller('NavController', ['$scope', '$http', '$location',
    'LocalStorage', 'SemesterHttpService', function($scope, $http, $location, 
        localStorage, semesterHttpService) {
    $scope.changeSemester = function(semester) {
        localStorage.set('selectedSemester', semester);
        $location.path('/login');
    };

    $scope.logout = function() {
        // TODO: invoke logout server call
        localStorage.clearAll();
        $location.path('/');
    };

    // Force logged-out/unregistered users to login before being allowed to
    // navigate to another part of the app.
    $scope.$watch(function() {
        return $location.path();
    }, function(newValue, oldValue) {
        if (!localStorage.get('user')) {
            $location.path('/login');
        }
    });

    $scope.$watch(function() {
        return localStorage.get('selectedSemester');
    }, function(newValue, oldValue) {
        $scope.selectedSemester = newValue;
    }, true);

    $scope.$watch(function() {
        return localStorage.get('allSemesters');
    }, function(newValue, oldValue) {
        $scope.allSemesters = newValue;
    }, true);

    $scope.$watch(function() {
        return localStorage.get('user');
    }, function(newValue, oldValue) {
        $scope.user = newValue;
    }, true);
}]);