/*
 * mock-salesforce-api.js — a fake Salesforce Apex REST API that runs in the browser.
 *
 * It answers the same endpoints as the real Apex classes, with the same JSON
 * shapes and error codes, so no service changes when you switch:
 *
 *   GET  /services/apexrest/jobs           -> [Job_Requirement__c, ...]  (Open jobs only)
 *   GET  /services/apexrest/jobs/{Id}      -> Job_Requirement__c          (404 if unknown)
 *   POST /services/apexrest/auth/register  -> { token, expiresAt, candidate }  (201)
 *   POST /services/apexrest/auth/login     -> { token, expiresAt, candidate }  (401 / 429)
 *   GET  /services/apexrest/auth/me        -> { candidate }                    (401)
 *   POST /services/apexrest/auth/logout    -> { signedOut: true }
 *   POST /services/apexrest/applications   -> { id, status }   (201, needs X-TB-Token)
 *   GET  /services/apexrest/applications   -> my applications  (needs X-TB-Token)
 *
 * Practice account: demo@talentbridge.dev / Demo1234
 *
 * MOCK ONLY: accounts, passwords and tokens are kept in this browser's
 * localStorage in plain text so you can inspect them in DevTools. A real server
 * must never do that; see CandidateAuth.cls for how Salesforce stores them.
 *
 * How it works: angular-mocks provides $httpBackend (module ngMockE2E). Every
 * $http call in the app goes through it, and these whenGET/whenPOST rules
 * answer instead of a real server. Anything not matched (the views/*.html
 * templates) is passed through to the real web server.
 *
 * Phase 3 switch: in index.html change ng-app="talentBridge.mock" to
 * ng-app="talentBridge" and remove the two MOCK script tags. Nothing else changes.
 */
(function () {
  'use strict';

  var APPLICATIONS_KEY = 'tb.applications';
  var CANDIDATES_KEY = 'tb.candidates';
  var SESSION_HOURS = 8;
  var MAX_FAILED_LOGINS = 5;
  var LOCK_MINUTES = 15;

  // Records look exactly like Salesforce returns them: an "attributes" object,
  // an 18-character Id, Name, and custom fields ending in __c.
  var JOBS = [
    {
      attributes: { type: 'Job_Requirement__c', url: '/services/data/v61.0/sobjects/Job_Requirement__c/a0B5g00000JbA1EAAV' },
      Id: 'a0B5g00000JbA1EAAV',
      Name: 'AngularJS UI Developer',
      Employment_Type__c: 'Contract - W2',
      Work_Location__c: 'Onsite',
      City__c: 'Dallas', State__c: 'TX',
      Duration__c: 'Long term',
      Experience_Years__c: 4,
      Skills__c: 'HTML5, CSS3, JavaScript, jQuery, AngularJS, Kendo UI, Bootstrap, Git',
      Description__c: 'Build and maintain reusable UI components for an enterprise web application, working closely with UI/UX designers and back-end developers.',
      Responsibilities__c: 'Turn wireframes and prototypes into responsive, reusable front-end code\nIntegrate REST APIs and back-end services\nTroubleshoot UI issues and ensure cross-browser compatibility\nManage branches and pull requests in Bitbucket',
      Status__c: 'Open',
      Posted_Date__c: '2026-10-14'
    },
    {
      attributes: { type: 'Job_Requirement__c', url: '/services/data/v61.0/sobjects/Job_Requirement__c/a0B5g00000JbA2EAAV' },
      Id: 'a0B5g00000JbA2EAAV',
      Name: 'Front-End Engineer',
      Employment_Type__c: 'Full-time',
      Work_Location__c: 'Hybrid',
      City__c: 'Austin', State__c: 'TX',
      Duration__c: 'Permanent',
      Experience_Years__c: 3,
      Skills__c: 'JavaScript, REST APIs, CSS3, Accessibility',
      Description__c: 'Join a product team building customer-facing dashboards.',
      Responsibilities__c: 'Build accessible, responsive pages\nWork with designers on new features\nWrite unit tests for UI logic',
      Status__c: 'Open',
      Posted_Date__c: '2026-10-12'
    },
    {
      attributes: { type: 'Job_Requirement__c', url: '/services/data/v61.0/sobjects/Job_Requirement__c/a0B5g00000JbA3EAAV' },
      Id: 'a0B5g00000JbA3EAAV',
      Name: 'Senior UI Developer',
      Employment_Type__c: 'Contract to hire',
      Work_Location__c: 'Remote',
      City__c: null, State__c: null,
      Duration__c: '6 months, then permanent',
      Experience_Years__c: 6,
      Skills__c: 'Angular, TypeScript, RxJS, Bootstrap',
      Description__c: 'Lead UI work on a migration from AngularJS to modern Angular.',
      Responsibilities__c: 'Plan the component migration\nReview pull requests\nMentor two junior developers',
      Status__c: 'Open',
      Posted_Date__c: '2026-10-10'
    },
    {
      attributes: { type: 'Job_Requirement__c', url: '/services/data/v61.0/sobjects/Job_Requirement__c/a0B5g00000JbA4EAAV' },
      Id: 'a0B5g00000JbA4EAAV',
      Name: 'Salesforce Developer',
      Employment_Type__c: 'Contract - W2',
      Work_Location__c: 'Onsite',
      City__c: 'Plano', State__c: 'TX',
      Duration__c: '12 months',
      Experience_Years__c: 5,
      Skills__c: 'Apex, SOQL, Lightning Web Components, REST APIs',
      Description__c: 'Extend a Salesforce org used by recruiters and account managers.',
      Responsibilities__c: 'Write Apex classes and triggers\nBuild Lightning Web Components\nIntegrate external systems through REST',
      Status__c: 'Open',
      Posted_Date__c: '2026-10-08'
    },
    {
      attributes: { type: 'Job_Requirement__c', url: '/services/data/v61.0/sobjects/Job_Requirement__c/a0B5g00000JbA5EAAV' },
      Id: 'a0B5g00000JbA5EAAV',
      Name: 'UX Engineer',
      Employment_Type__c: 'Full-time',
      Work_Location__c: 'Hybrid',
      City__c: 'Houston', State__c: 'TX',
      Duration__c: 'Permanent',
      Experience_Years__c: 4,
      Skills__c: 'Figma, HTML5, CSS3, Design systems',
      Description__c: 'Bridge design and engineering by building the company design system.',
      Responsibilities__c: 'Build and document shared components\nPrototype new flows with designers\nRun accessibility reviews',
      Status__c: 'Open',
      Posted_Date__c: '2026-10-05'
    },
    {
      attributes: { type: 'Job_Requirement__c', url: '/services/data/v61.0/sobjects/Job_Requirement__c/a0B5g00000JbA6EAAV' },
      Id: 'a0B5g00000JbA6EAAV',
      Name: 'jQuery Developer',
      Employment_Type__c: 'Contract - W2',
      Work_Location__c: 'Remote',
      City__c: null, State__c: null,
      Duration__c: '6 months',
      Experience_Years__c: 2,
      Skills__c: 'jQuery, HTML5, CSS3, Bootstrap',
      Description__c: 'Maintain and modernise a legacy customer portal.',
      Responsibilities__c: 'Fix UI bugs across browsers\nReplace scattered DOM code with reusable plugins\nImprove page load time',
      Status__c: 'Open',
      Posted_Date__c: '2026-10-02'
    },
    {
      attributes: { type: 'Job_Requirement__c', url: '/services/data/v61.0/sobjects/Job_Requirement__c/a0B5g00000JbA7EAAV' },
      Id: 'a0B5g00000JbA7EAAV',
      Name: 'Java Spring Boot Developer',
      Employment_Type__c: 'Contract to hire',
      Work_Location__c: 'Hybrid',
      City__c: 'Dallas', State__c: 'TX',
      Duration__c: '18 months',
      Experience_Years__c: 5,
      Skills__c: 'Java, Spring Boot, REST APIs, SQL',
      Description__c: 'Build the REST services behind a claims-processing front end.',
      Responsibilities__c: 'Design and build REST endpoints\nWrite integration tests\nWork with front-end developers on API contracts',
      Status__c: 'Open',
      Posted_Date__c: '2026-09-30'
    },
    {
      // Closed: hidden from the board, but its page still opens from an old link.
      attributes: { type: 'Job_Requirement__c', url: '/services/data/v61.0/sobjects/Job_Requirement__c/a0B5g00000JbA8EAAV' },
      Id: 'a0B5g00000JbA8EAAV',
      Name: 'QA Automation Engineer',
      Employment_Type__c: 'Contract - W2',
      Work_Location__c: 'Onsite',
      City__c: 'Irving', State__c: 'TX',
      Duration__c: '6 months',
      Experience_Years__c: 3,
      Skills__c: 'Selenium, JavaScript, Jenkins',
      Description__c: 'Automate regression tests for a web application.',
      Responsibilities__c: 'Write UI automation tests\nRun regression suites before releases',
      Status__c: 'Closed',
      Posted_Date__c: '2026-09-01'
    }
  ];

  // ---- small helpers -------------------------------------------------------

  function loadList(key) {
    try { return JSON.parse(window.localStorage.getItem(key)) || []; }
    catch (e) { return []; }
  }

  function saveList(key, list) {
    try { window.localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  function loadApplications() { return loadList(APPLICATIONS_KEY); }
  function saveApplications(list) { saveList(APPLICATIONS_KEY, list); }

  // Accounts, with the practice account always present.
  function loadCandidates() {
    var list = loadList(CANDIDATES_KEY);
    var hasDemo = list.some(function (c) { return c.email === 'demo@talentbridge.dev'; });
    if (!hasDemo) {
      list.push({ id: 'a0D5g00000Demo01AA', fullName: 'Demo Candidate', email: 'demo@talentbridge.dev',
                  password: 'Demo1234', failedLogins: 0, lockedUntil: null, token: null, expiresAt: null });
    }
    return list;
  }
  function saveCandidates(list) { saveList(CANDIDATES_KEY, list); }

  function newToken() {
    var hex = '0123456789abcdef', token = '';
    for (var i = 0; i < 64; i++) { token += hex.charAt(Math.floor(Math.random() * 16)); }
    return token;
  }

  // Header names can arrive in any case.
  function header(headers, name) {
    for (var key in headers) {
      if (headers.hasOwnProperty(key) && key.toLowerCase() === name.toLowerCase()) { return headers[key]; }
    }
    return null;
  }

  // The signed-in candidate for a request, like CandidateAuth.currentCandidate().
  function currentCandidate(headers) {
    var token = header(headers, 'X-TB-Token');
    if (!token) { return null; }
    var match = loadCandidates().filter(function (c) { return c.token === token; })[0];
    return match && new Date(match.expiresAt) > new Date() ? match : null;
  }

  function publicView(c) { return { id: c.id, fullName: c.fullName, email: c.email }; }

  function startSession(c) {
    c.token = newToken();
    c.expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
    c.failedLogins = 0;
    c.lockedUntil = null;
    return { token: c.token, expiresAt: c.expiresAt, candidate: publicView(c) };
  }

  function findJob(id) {
    for (var i = 0; i < JOBS.length; i++) { if (JOBS[i].Id === id) { return JOBS[i]; } }
    return null;
  }

  // Salesforce platform errors are an array of { errorCode, message }.
  function sfError(status, code, message) {
    return [status, [{ errorCode: code, message: message }]];
  }

  function newId(prefix) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var id = prefix || 'a0C5g00000';
    for (var i = 0; i < 8; i++) { id += chars.charAt(Math.floor(Math.random() * chars.length)); }
    return id;
  }

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ---- the module ----------------------------------------------------------

  angular.module('talentBridge.mock', ['talentBridge', 'ngMockE2E'])

    // fail: every API call returns 503 while true. delay: fake network time in ms.
    .value('MockSettings', { fail: false, delay: 600 })

    // Adds the fake network delay so loading states are visible.
    .factory('mockLatency', ['$q', '$timeout', 'MockSettings', 'API_URL',
      function ($q, $timeout, MockSettings, API_URL) {
        function isApi(config) { return config && config.url.indexOf(API_URL) === 0; }
        function later(value, reject) {
          return $timeout(angular.noop, MockSettings.delay).then(function () {
            return reject ? $q.reject(value) : value;
          });
        }
        return {
          response: function (r) { return isApi(r.config) ? later(r, false) : r; },
          responseError: function (r) { return isApi(r.config) ? later(r, true) : $q.reject(r); }
        };
      }])

    .config(['$httpProvider', function ($httpProvider) {
      $httpProvider.interceptors.push('mockLatency');
    }])

    .run(['$httpBackend', '$rootScope', 'MockSettings', 'API_URL',
      function ($httpBackend, $rootScope, MockSettings, API_URL) {

        // Escape the base URL so it can be used inside a regular expression.
        var base = API_URL.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
        var JOB_BY_ID = new RegExp('^' + base + '\\/jobs\\/([A-Za-z0-9]{15,18})$');
        var DOWN = sfError(503, 'SERVICE_UNAVAILABLE', 'The job service is unavailable (simulated failure).');

        // The header's practice switches.
        $rootScope.mock = MockSettings;
        $rootScope.resetMockData = function () {
          saveApplications([]);
          saveCandidates([]);
          try { window.sessionStorage.removeItem('tb.session'); } catch (e) { /* ignore */ }
          window.location.reload();
        };

        // GET /jobs : like  SELECT ... FROM Job_Requirement__c WHERE Status__c = 'Open'
        //                    ORDER BY Posted_Date__c DESC
        $httpBackend.whenGET(API_URL + '/jobs').respond(function () {
          if (MockSettings.fail) { return DOWN; }
          var open = JOBS.filter(function (j) { return j.Status__c === 'Open'; })
            .sort(function (a, b) { return a.Posted_Date__c < b.Posted_Date__c ? 1 : -1; });
          return [200, angular.copy(open)];
        });

        // GET /jobs/{Id}
        $httpBackend.whenGET(JOB_BY_ID).respond(function (method, url) {
          if (MockSettings.fail) { return DOWN; }
          var job = findJob(url.match(JOB_BY_ID)[1]);
          return job ? [200, angular.copy(job)] : sfError(404, 'NOT_FOUND', 'That job no longer exists.');
        });

        // ---- accounts (AuthResource.cls) ----

        $httpBackend.whenPOST(API_URL + '/auth/register').respond(function (method, url, body) {
          if (MockSettings.fail) { return DOWN; }
          var data = angular.fromJson(body) || {};
          var fullName = (data.fullName || '').trim();
          var email = (data.email || '').trim().toLowerCase();
          var password = data.password || '';

          if (!fullName || !email || !password) {
            return sfError(400, 'REQUIRED_FIELD_MISSING', 'Name, email and password are required.');
          }
          if (!EMAIL.test(email)) { return sfError(400, 'INVALID_EMAIL_ADDRESS', 'Enter a valid email address.'); }
          if (!/^(?=.*[A-Za-z])(?=.*[0-9]).{8,128}$/.test(password)) {
            return sfError(400, 'WEAK_PASSWORD', 'Use at least 8 characters, with at least one letter and one number.');
          }
          var candidates = loadCandidates();
          if (candidates.some(function (c) { return c.email === email; })) {
            return sfError(409, 'DUPLICATE_VALUE', 'An account with this email already exists. Sign in instead.');
          }
          var candidate = { id: newId('a0D5g00000'), fullName: fullName, email: email, password: password };
          var session = startSession(candidate);
          candidates.push(candidate);
          saveCandidates(candidates);
          return [201, session];
        });

        $httpBackend.whenPOST(API_URL + '/auth/login').respond(function (method, url, body) {
          if (MockSettings.fail) { return DOWN; }
          var data = angular.fromJson(body) || {};
          var email = (data.email || '').trim().toLowerCase();
          if (!email || !data.password) {
            return sfError(400, 'REQUIRED_FIELD_MISSING', 'Enter your email and password.');
          }
          var candidates = loadCandidates();
          var candidate = candidates.filter(function (c) { return c.email === email; })[0];
          var wrong = sfError(401, 'INVALID_LOGIN', 'Email or password is incorrect.');
          var locked = sfError(429, 'ACCOUNT_LOCKED', 'Too many wrong passwords. Try again in ' + LOCK_MINUTES + ' minutes.');

          if (!candidate) { return wrong; }
          if (candidate.lockedUntil && new Date(candidate.lockedUntil) > new Date()) { return locked; }
          if (candidate.password !== data.password) {
            candidate.failedLogins = (candidate.failedLogins || 0) + 1;
            var nowLocked = candidate.failedLogins >= MAX_FAILED_LOGINS;
            if (nowLocked) {
              candidate.failedLogins = 0;
              candidate.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
            }
            saveCandidates(candidates);
            return nowLocked ? locked : wrong;
          }
          var session = startSession(candidate);
          saveCandidates(candidates);
          return [200, session];
        });

        $httpBackend.whenGET(API_URL + '/auth/me').respond(function (method, url, body, headers) {
          if (MockSettings.fail) { return DOWN; }
          var me = currentCandidate(headers);
          return me ? [200, { candidate: publicView(me) }] : sfError(401, 'INVALID_SESSION', 'Please sign in.');
        });

        $httpBackend.whenPOST(API_URL + '/auth/logout').respond(function (method, url, body, headers) {
          var me = currentCandidate(headers);
          if (me) {
            var candidates = loadCandidates();
            candidates.forEach(function (c) { if (c.id === me.id) { c.token = null; c.expiresAt = null; } });
            saveCandidates(candidates);
          }
          return [200, { signedOut: true }];
        });

        // ---- applications (ApplicationsResource.cls) ----

        // POST /applications : server-side rules. The browser validates too,
        // but a server must never trust what a browser sends.
        $httpBackend.whenPOST(API_URL + '/applications').respond(function (method, url, body, headers) {
          if (MockSettings.fail) { return DOWN; }

          var me = currentCandidate(headers);
          if (!me) { return sfError(401, 'INVALID_SESSION', 'Please sign in to apply.'); }

          var app = (angular.fromJson(body) || {}).application || {};
          var job = findJob(app.Job__c);

          if (!job) { return sfError(404, 'NOT_FOUND', 'That job no longer exists.'); }
          if (job.Status__c !== 'Open') {
            return sfError(400, 'JOB_CLOSED', 'This job is no longer accepting applications.');
          }
          if (!app.Work_Authorization__c || !app.Resume_URL__c) {
            return sfError(400, 'REQUIRED_FIELD_MISSING', 'Work authorization and resume link are required.');
          }

          // The email always comes from the account, never from the body.
          app.Email__c = me.email;
          app.Candidate__c = me.id;
          app.Full_Name__c = app.Full_Name__c || me.fullName;

          var applications = loadApplications();
          var duplicate = applications.some(function (a) {
            return a.Job__c === app.Job__c &&
              (a.Candidate__c === me.id || (a.Email__c || '').toLowerCase() === me.email);
          });
          if (duplicate) {
            return sfError(409, 'DUPLICATE_VALUE', 'You have already applied to this job with ' + me.email + '.');
          }

          app.Id = newId();
          app.Name = 'APP-' + ('0000' + (applications.length + 1)).slice(-5);
          app.Status__c = 'Submitted';
          app.CreatedDate = new Date().toISOString();
          applications.push(app);
          saveApplications(applications);
          return [201, { id: app.Id, status: app.Status__c }];
        });

        // GET /applications : the signed-in candidate's applications, newest first.
        $httpBackend.whenGET(API_URL + '/applications').respond(function (method, url, body, headers) {
          if (MockSettings.fail) { return DOWN; }
          var me = currentCandidate(headers);
          if (!me) { return sfError(401, 'INVALID_SESSION', 'Please sign in to see your applications.'); }

          var mine = loadApplications()
            .filter(function (a) { return a.Candidate__c === me.id; })
            .sort(function (a, b) { return a.CreatedDate < b.CreatedDate ? 1 : -1; })
            .map(function (a) {
              var job = findJob(a.Job__c);
              return {
                id: a.Id,
                applicationNumber: a.Name,
                status: a.Status__c,
                submittedAt: a.CreatedDate,
                job: { id: a.Job__c, title: job ? job.Name : 'Job no longer listed' }
              };
            });
          return [200, mine];
        });

        // Everything else (the views/*.html templates) goes to the real server.
        $httpBackend.whenGET(/^views\//).passThrough();
      }]);
})();
