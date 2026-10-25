/*
 * job-detail.controller.js — one job's full requirement (views/job-detail.html).
 *
 * Reads the id from the URL (#/jobs/<id>), loads that job, and shows it.
 * Same state machine as the board: 'loading' | 'ready' | 'error'.
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .controller('JobDetailCtrl', [
      '$routeParams', 'JobService', 'ApiError', 'AuthService',
      function ($routeParams, JobService, ApiError, AuthService) {
        var vm = this;

        vm.isSignedIn = AuthService.isSignedIn;

        vm.job = null;
        vm.state = 'loading';
        vm.errorMessage = '';

        vm.load = function () {
          vm.state = 'loading';
          JobService.getById($routeParams.id)
            .then(function (job) {
              vm.job = job;
              vm.state = 'ready';
            })
            .catch(function (response) {
              vm.errorMessage = ApiError.message(response);
              vm.state = 'error';
            });
        };

        vm.load();
      }
    ]);
})();
