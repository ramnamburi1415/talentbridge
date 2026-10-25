/*
 * api-error.service.js
 *
 * Turns a failed $http response into one sentence a job seeker can read.
 *
 * Salesforce Apex REST sends errors in two shapes, so both are handled:
 *   - our own Apex code:      { "message": "..." }
 *   - Salesforce platform:    [ { "errorCode": "NOT_FOUND", "message": "..." } ]
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .factory('ApiError', function () {

      function message(response) {
        // status 0 or -1 means the request never reached a server (offline, CORS, DNS).
        if (!response || response.status <= 0) {
          return 'We can\'t reach the job service. Check your connection and try again.';
        }

        var data = response.data;
        if (angular.isArray(data) && data.length && data[0].message) { return data[0].message; }
        if (data && data.message) { return data.message; }

        if (response.status === 401) { return 'Please sign in to continue.'; }
        if (response.status === 404) { return 'That job no longer exists.'; }
        return 'Something went wrong (status ' + response.status + '). Please try again.';
      }

      return { message: message };
    });
})();
