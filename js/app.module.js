/*
 * app.module.js — READ THIS FILE FIRST.
 *
 * Creates the AngularJS module "talentBridge", lists what it depends on,
 * defines app-wide constants and maps each URL to a screen.
 *
 * Everything is wrapped in an IIFE, (function () { ... })(), so variables
 * declared here never leak into the global scope.
 */
(function () {
  'use strict';

  // Route guard used by every route that needs a signed-in candidate (below).
  // $inject lists what to inject, so it still works after minification.
  requireUser.$inject = ['AuthService'];
  function requireUser(AuthService) {
    return AuthService.requireUser();
  }

  angular.module('talentBridge', [
    'ngRoute',          // URL routing: #/jobs, #/jobs/:id, #/jobs/:id/apply, #/login
    'ngMessages',       // tidy validation messages on the apply form
    'kendo.directives'  // Kendo UI widgets as AngularJS attributes (kendo-drop-down-list)
  ])

    // Base address of the Salesforce Apex REST API.
    // Phase 1: the mock API answers this path inside the browser.
    // Phase 3: change it to https://<your-site>.my.salesforce-sites.com/services/apexrest
    .constant('API_URL', '/services/apexrest')

    // The header that carries the sign-in token (see auth.interceptor.js for why
    // it isn't the usual "Authorization").
    .constant('TOKEN_HEADER', 'X-TB-Token')

    // Values for dropdowns. In Salesforce these are picklist values on Job_Requirement__c.
    .constant('WORK_LOCATIONS', ['Onsite', 'Hybrid', 'Remote'])
    .constant('EMPLOYMENT_TYPES', ['Contract - W2', 'Contract to hire', 'Full-time'])
    .constant('WORK_AUTHORIZATIONS', ['US citizen', 'Green card', 'H-1B', 'EAD', 'Other'])

    .config(['$routeProvider', '$locationProvider', function ($routeProvider, $locationProvider) {
      // AngularJS 1.6+ defaults to '#!/jobs'. An empty prefix gives cleaner '#/jobs' links.
      $locationProvider.hashPrefix('');

      // controllerAs: 'vm' means templates write vm.jobs instead of relying on $scope.
      $routeProvider
        .when('/jobs', {
          templateUrl: 'views/job-board.html',
          controller: 'JobBoardCtrl',
          controllerAs: 'vm'
        })
        .when('/jobs/:id', {
          templateUrl: 'views/job-detail.html',
          controller: 'JobDetailCtrl',
          controllerAs: 'vm'
        })
        // Route guard: "resolve" must succeed before the screen opens. requireUser()
        // fails when nobody is signed in, and the $routeChangeError handler below
        // sends the person to #/login instead.
        .when('/jobs/:id/apply', {
          templateUrl: 'views/apply.html',
          controller: 'ApplyCtrl',
          controllerAs: 'vm',
          resolve: { user: requireUser }
        })
        .when('/my-applications', {
          templateUrl: 'views/my-applications.html',
          controller: 'MyApplicationsCtrl',
          controllerAs: 'vm',
          resolve: { user: requireUser }
        })
        .when('/login', {
          templateUrl: 'views/login.html',
          controller: 'LoginCtrl',
          controllerAs: 'vm'
        })
        .when('/register', {
          templateUrl: 'views/register.html',
          controller: 'RegisterCtrl',
          controllerAs: 'vm'
        })
        .otherwise({ redirectTo: '/jobs' });
    }])

    .run(['$rootScope', '$window', '$location', function ($rootScope, $window, $location) {
      // Every time the route changes, scroll back to the top of the page.
      $rootScope.$on('$routeChangeSuccess', function () {
        $window.scrollTo(0, 0);
      });

      // A guarded route was refused: go to sign in, and come back afterwards.
      // $location.url() is already the page they tried to open. replace() keeps
      // the refused page out of the history, so Back doesn't bounce them again.
      $rootScope.$on('$routeChangeError', function (event, current, previous, rejection) {
        if (rejection && rejection.needsSignIn) {
          $location.url('/login?returnTo=' + encodeURIComponent($location.url())).replace();
        }
      });
    }]);

})();
