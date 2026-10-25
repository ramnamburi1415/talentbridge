/*
 * apply.controller.js — the application form (views/apply.html).
 *
 * Flow:
 *   1. Load the job, so the page can show its title and check it is still open.
 *   2. The user fills the form. AngularJS validates as they type; the submit
 *      button stays disabled until the form is valid.
 *   3. submit() POSTs the application.
 *        success -> show the success modal (vm.submitted holds the reference)
 *        failure -> stay on the form, keep everything typed, show the message
 *   4. Closing the modal goes back to the job board.
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .controller('ApplyCtrl', [
      '$routeParams', '$location', 'JobService', 'ApiError', 'AuthService', 'WORK_AUTHORIZATIONS',
      function ($routeParams, $location, JobService, ApiError, AuthService, WORK_AUTHORIZATIONS) {
        var vm = this;
        var jobId = $routeParams.id;

        // The route guard guarantees someone is signed in. Their account's email is
        // the one the application uses, so the form only shows it.
        vm.user = AuthService.user();

        vm.workAuthorizations = WORK_AUTHORIZATIONS;
        vm.job = null;
        vm.state = 'loading';
        vm.errorMessage = '';

        vm.form = { fullName: vm.user.fullName, phone: '', workAuthorization: '', resumeUrl: '' };
        vm.submitting = false;
        vm.serverError = '';
        vm.sessionExpired = false;   // true after a 401: show a "sign in again" link
        vm.submitted = null;   // set to { id, status } after a successful POST

        vm.load = function () {
          vm.state = 'loading';
          JobService.getById(jobId)
            .then(function (job) {
              vm.job = job;
              vm.state = 'ready';
            })
            .catch(function (response) {
              vm.errorMessage = ApiError.message(response);
              vm.state = 'error';
            });
        };

        vm.submit = function (form) {
          // Guard: the button is disabled when invalid, but Enter can still submit.
          if (form.$invalid || vm.submitting) { return; }

          vm.submitting = true;
          vm.serverError = '';
          vm.sessionExpired = false;

          JobService.apply(jobId, vm.form)
            .then(function (result) {
              vm.submitted = result;            // opens the success modal
            })
            .catch(function (response) {
              vm.serverError = ApiError.message(response);
              vm.sessionExpired = response.status === 401;
            })
            .finally(function () {              // runs after success AND failure
              vm.submitting = false;
            });
        };

        // Link for "sign in again": comes back to this form afterwards.
        vm.signInAgainLink = '#/login?returnTo=' + encodeURIComponent('/jobs/' + jobId + '/apply');

        // Called by the success modal when it closes (button, Esc or backdrop).
        vm.finish = function () {
          $location.path('/my-applications');
        };

        vm.load();
      }
    ]);
})();
