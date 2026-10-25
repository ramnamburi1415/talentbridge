/*
 * register.controller.js — create an account (views/register.html).
 *
 * The password rules here match AuthResource.cls on the server:
 * at least 8 characters, with at least one letter and one number.
 * The browser checks them for speed; the server checks them again for safety.
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .controller('RegisterCtrl', ['$location', 'AuthService', 'ApiError',
      function ($location, AuthService, ApiError) {
        var vm = this;

        vm.returnTo = AuthService.returnPath($location.search().returnTo);
        vm.loginLink = '#/login?returnTo=' + encodeURIComponent(vm.returnTo);

        // Used by ng-pattern in the template: must contain a letter AND a number.
        vm.passwordPattern = /^(?=.*[A-Za-z])(?=.*[0-9]).{8,128}$/;

        vm.form = { fullName: '', email: '', password: '', confirmPassword: '' };
        vm.submitting = false;
        vm.serverError = '';

        if (AuthService.isSignedIn()) {
          $location.url(vm.returnTo).replace();
          return;
        }

        vm.submit = function (form) {
          if (form.$invalid || vm.submitting) { return; }

          vm.submitting = true;
          vm.serverError = '';

          AuthService.register(vm.form.fullName, vm.form.email, vm.form.password)
            .then(function () {
              $location.url(vm.returnTo);
            })
            .catch(function (response) {
              // 409: that email already has an account. 400: a rule failed on the server.
              vm.serverError = ApiError.message(response);
              vm.emailTaken = response.status === 409;
            })
            .finally(function () {
              vm.submitting = false;
            });
        };
      }]);
})();
