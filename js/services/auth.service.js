/*
 * auth.service.js — who is signed in, and the calls that sign people in and out.
 *
 * The API (salesforce/.../AuthResource.cls):
 *   POST /auth/register  { fullName, email, password }  -> 201 { token, expiresAt, candidate }
 *   POST /auth/login     { email, password }            -> 200 { token, expiresAt, candidate }
 *   POST /auth/logout                                   -> 200 { signedOut: true }
 *
 * The token is kept in sessionStorage: it survives a page refresh but is gone
 * when the tab closes. (localStorage would keep people signed in for days, but
 * any script on the page can read either one, which is why the token expires
 * after 8 hours on the server.)
 *
 * The token is added to API calls by authInterceptor, not here. Controllers
 * never touch the token: they only ask "who is signed in?".
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .factory('AuthService', ['$http', '$q', '$window', 'API_URL', 'TOKEN_HEADER',
      function ($http, $q, $window, API_URL, TOKEN_HEADER) {

        var STORAGE_KEY = 'tb.session';
        var session = restore();   // { token, expiresAt, candidate } or null

        // Read the saved session, ignoring it if it has expired or is unreadable.
        function restore() {
          try {
            var saved = angular.fromJson($window.sessionStorage.getItem(STORAGE_KEY));
            if (saved && saved.token && new Date(saved.expiresAt) > new Date()) { return saved; }
          } catch (e) { /* private mode or bad JSON: start signed out */ }
          return null;
        }

        function store(value) {
          session = value;
          try {
            if (value) { $window.sessionStorage.setItem(STORAGE_KEY, angular.toJson(value)); }
            else { $window.sessionStorage.removeItem(STORAGE_KEY); }
          } catch (e) { /* storage unavailable: the session still lives in memory */ }
        }

        // Both login and register answer with the same shape.
        function startSession(response) {
          store({
            token: response.data.token,
            expiresAt: response.data.expiresAt,
            candidate: response.data.candidate
          });
          return session.candidate;
        }

        return {
          // { id, fullName, email } or null
          user: function () { return session ? session.candidate : null; },

          isSignedIn: function () { return !!session; },

          // Only authInterceptor should need this.
          token: function () { return session ? session.token : null; },

          login: function (email, password) {
            return $http.post(API_URL + '/auth/login', { email: email, password: password })
              .then(startSession);
          },

          register: function (fullName, email, password) {
            return $http.post(API_URL + '/auth/register',
              { fullName: fullName, email: email, password: password })
              .then(startSession);
          },

          // Forget the session here first, so the screen updates at once, then tell
          // the server. The token is passed directly because it is no longer stored.
          logout: function () {
            if (!session) { return $q.resolve(); }
            var headers = {};
            headers[TOKEN_HEADER] = session.token;
            store(null);
            return $http.post(API_URL + '/auth/logout', {}, { headers: headers })
              .catch(angular.noop);   // already signed out locally; a failed call changes nothing
          },

          // Drop the session without calling the server (used when the server says 401).
          clear: function () { store(null); },

          // Used by routes that need a signed-in candidate (see app.module.js).
          requireUser: function () {
            return session ? $q.resolve(session.candidate) : $q.reject({ needsSignIn: true });
          },

          // Where to go after signing in. Only paths inside this app are allowed
          // ("/jobs/123/apply"), never a full address someone put in the link.
          returnPath: function (value) {
            var ok = typeof value === 'string' && value.charAt(0) === '/' && value.charAt(1) !== '/' &&
              value.indexOf('/login') !== 0 && value.indexOf('/register') !== 0;
            return ok ? value : '/jobs';
          }
        };
      }]);
})();
