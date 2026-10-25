/*
 * login.controller.js — the sign-in page (views/login.html).
 *
 * Arrives here in three ways:
 *   - the "Sign in" link in the header           -> afterwards, back to the jobs
 *   - a guarded page (apply, my applications)    -> ?returnTo=/jobs/<id>/apply
 *   - the server rejected an expired token       -> ?expired=1&returnTo=...
 * After signing in we go to returnTo, so the person lands where they were heading.
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .controller('LoginCtrl', ['$location', 'AuthService', 'ApiError',
      function ($location, AuthService, ApiError) {
        var vm = this;
        var params = $location.search();

        vm.returnTo = AuthService.returnPath(params.returnTo);
        vm.expired = params.expired === '1';
        vm.registerLink = '#/register?returnTo=' + encodeURIComponent(vm.returnTo);

        vm.form = { email: '', password: '' };
        vm.submitting = false;
        vm.serverError = '';

        // Already signed in? Nothing to do here.
        if (AuthService.isSignedIn()) {
          $location.url(vm.returnTo).replace();
          return;
        }

        vm.submit = function (form) {
          if (form.$invalid || vm.submitting) { return; }

          vm.submitting = true;
          vm.serverError = '';

          AuthService.login(vm.form.email, vm.form.password)
            .then(function () {
              $location.url(vm.returnTo);
            })
            .catch(function (response) {
              // 401 wrong email or password, 429 locked after too many tries.
              vm.serverError = ApiError.message(response);
            })
            .finally(function () {
              vm.submitting = false;
            });
        };
      }]);
})();
