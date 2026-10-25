/*
 * auth.interceptor.js — runs on EVERY $http request and response.
 *
 * request:        adds the X-TB-Token header to calls to our API, so no service
 *                 or controller has to remember to do it.
 * responseError:  a 401 means the server no longer accepts our token (expired,
 *                 or signed in somewhere else). Forget it locally, and for page
 *                 loads (GET) send the person to the sign-in page, then back.
 *                 For form submits (POST) we stay put, so nothing typed is lost;
 *                 the form shows the message and a "Sign in again" link.
 *
 * Why $injector.get('AuthService') instead of injecting AuthService directly?
 * AuthService needs $http, and $http needs this interceptor, so injecting it
 * would be a circular dependency. Looking it up at call time breaks the circle.
 *
 * Why X-TB-Token and not "Authorization: Bearer ..."? Salesforce reads the
 * Authorization header itself and rejects tokens it didn't issue before our
 * Apex code ever runs.
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .factory('authInterceptor', ['$q', '$injector', 'API_URL', 'TOKEN_HEADER',
      function ($q, $injector, API_URL, TOKEN_HEADER) {

        function isApiCall(config) {
          return !!config && typeof config.url === 'string' && config.url.indexOf(API_URL + '/') === 0;
        }

        function isAuthCall(config) {
          return config.url.indexOf(API_URL + '/auth/') === 0;
        }

        return {
          request: function (config) {
            if (isApiCall(config)) {
              var token = $injector.get('AuthService').token();
              if (token && !config.headers[TOKEN_HEADER]) {
                config.headers[TOKEN_HEADER] = token;
              }
            }
            return config;
          },

          responseError: function (response) {
            var config = response.config;
            // A 401 from /auth/login just means a wrong password: not our business here.
            if (response.status === 401 && isApiCall(config) && !isAuthCall(config)) {
              $injector.get('AuthService').clear();
              if (config.method === 'GET') {
                var $location = $injector.get('$location');
                $location.url('/login?expired=1&returnTo=' + encodeURIComponent($location.url()));
              }
            }
            return $q.reject(response);
          }
        };
      }])

    .config(['$httpProvider', function ($httpProvider) {
      $httpProvider.interceptors.push('authInterceptor');
    }]);
})();
