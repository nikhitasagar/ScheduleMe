var scheduleMeApp = angular.module('ScheduleMeApp');

/*
 * Controller for login screen. Simply calls one function that retrieves all
 * data and redirects. The "Loading..." message is shown in the interim.
 */
scheduleMeApp.controller('LoadDataController', ['$scope', '$location',
    'ServerDataService', function($scope, $location, serverDataService) {
    $scope.getAllServerData = function() {
        serverDataService.getServerData().then(function() {
            $location.path('/schedule');
        });
    };

    $scope.getAllServerData();
}]);