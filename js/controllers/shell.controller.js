/*
 * shell.controller.js
 *
 * Owns the page frame that never changes between screens: the header.
 * Each screen has its own controller; this one knows which link is active
 * and who is signed in.
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .controller('ShellCtrl', ['$location', 'AuthService', function ($location, AuthService) {
      var shell = this;

      // True on the board and on any job page, so "Jobs" stays highlighted.
      shell.onJobs = function () {
        return $location.path().indexOf('/jobs') === 0;
      };

      shell.onPath = function (path) {
        return $location.path() === path;
      };

      // Functions, not copies: the header re-reads them on every digest, so it
      // updates the moment someone signs in or out on any screen.
      shell.user = AuthService.user;
      shell.isSignedIn = AuthService.isSignedIn;

      // "Ram Namburi" -> "Ram"
      shell.firstName = function () {
        var user = AuthService.user();
        return user && user.fullName ? user.fullName.split(' ')[0] : '';
      };

      // Sign-in link that brings the person back to the page they're on.
      shell.signInLink = function () {
        return '#/login?returnTo=' + encodeURIComponent($location.url());
      };

      shell.signOut = function () {
        AuthService.logout();
        $location.url('/jobs');
      };
    }]);
})();
