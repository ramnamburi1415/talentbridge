/*
 * my-applications.controller.js — the signed-in candidate's applications
 * (views/my-applications.html). The route is guarded, so a candidate is
 * always signed in when this runs.
 *
 * Same state machine as the other screens: 'loading' | 'ready' | 'empty' | 'error'.
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .controller('MyApplicationsCtrl', ['JobService', 'ApiError', 'AuthService',
      function (JobService, ApiError, AuthService) {
        var vm = this;

        vm.user = AuthService.user();
        vm.applications = [];
        vm.state = 'loading';
        vm.errorMessage = '';

        vm.load = function () {
          vm.state = 'loading';
          JobService.getMyApplications()
            .then(function (applications) {
              vm.applications = applications;
              vm.state = applications.length ? 'ready' : 'empty';
            })
            .catch(function (response) {
              vm.errorMessage = ApiError.message(response);
              vm.state = 'error';
            });
        };

        vm.load();
      }]);
})();
