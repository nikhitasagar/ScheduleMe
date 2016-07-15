var scheduleMeApp = angular.module('ScheduleMeApp');

/*
 * Controller for logging in and checking current login status to avoid
 * repeated logins.
 */
scheduleMeApp.controller('LoginController', ['$scope', '$http', '$location',
    'LocalStorage', 'UserHttpService', function($scope, $http, $location, 
        localStorage, userHttpService) {
    $scope.loginError = false;

    $scope.checkLoginStatus = function() {
        var queryString = $location.search();
        if (queryString && queryString['bypass'] === true) {
            var user = {
                'user_id': queryString.user_id,
                'username': queryString.username
            };
            $location.search('bypass', null);
            $location.search('user_id', null);
            $location.search('username', null);
            localStorage.set('user', user);
        }
        var isLoggedIn = localStorage.get('user') !== undefined &&
            localStorage.get('user') !== null;
        if (isLoggedIn === true) {
            $location.path('/index');
        }
    };

    $scope.login = function() {
        userHttpService.login($scope.username).then(function(user) {
            if (user !== undefined && user !== null) {
                localStorage.set('user', user);
                $location.path('/index');
            } else {
                $scope.loginError = true;
            }
        });
    };

    $scope.checkLoginStatus();
}]);