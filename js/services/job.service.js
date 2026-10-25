/*
 * job.service.js — every jobs and applications API call goes through here.
 * (Signing in and out lives in auth.service.js.)
 *
 * Two jobs:
 *  1. Make the HTTP calls ($http returns a promise for each one).
 *  2. Translate between Salesforce field names and clean names for the screens.
 *
 * Salesforce record (what the API sends)      Job object (what screens use)
 *   Id                                    ->    id
 *   Name                                  ->    title
 *   Work_Location__c                      ->    workLocation
 *   Skills__c  "HTML5, CSS3, jQuery"      ->    skills ['HTML5', 'CSS3', 'jQuery']
 *   Posted_Date__c "2026-10-14"           ->    postedDate (a JavaScript Date)
 *
 * Because of this mapping, if a Salesforce field is ever renamed, only this
 * file changes. Controllers and templates never see a "__c" name.
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .factory('JobService', ['$http', 'API_URL', function ($http, API_URL) {

      // "2026-10-14" -> local Date. new Date('2026-10-14') would be read as UTC
      // midnight and show Oct 13 in US time zones, so build it from the parts.
      function toDate(text) {
        if (!text) { return null; }
        var p = text.split('-');
        return new Date(+p[0], +p[1] - 1, +p[2]);
      }

      // "a, b ,c" -> ['a', 'b', 'c']
      function toList(text, separator) {
        if (!text) { return []; }
        return text.split(separator)
          .map(function (item) { return item.trim(); })
          .filter(function (item) { return item.length > 0; });
      }

      // One Salesforce Job_Requirement__c record -> one job object.
      function fromSalesforce(record) {
        var city = record.City__c || '';
        var state = record.State__c || '';
        return {
          id: record.Id,
          title: record.Name,
          employmentType: record.Employment_Type__c,
          workLocation: record.Work_Location__c,
          city: city,
          state: state,
          // Remote jobs usually have no city, so say so instead of leaving it blank.
          location: [city, state].filter(Boolean).join(', ') ||
            (record.Work_Location__c === 'Remote' ? 'Anywhere (remote)' : 'Not specified'),
          duration: record.Duration__c,
          experience: record.Experience_Years__c,
          skills: toList(record.Skills__c, ','),
          description: record.Description__c,
          responsibilities: toList(record.Responsibilities__c, '\n'),
          status: record.Status__c,
          isOpen: record.Status__c === 'Open',
          postedDate: toDate(record.Posted_Date__c)
        };
      }

      // "2026-10-23T18:05:00Z" (UTC) -> Date. Times with a "Z" are safe to parse directly.
      function toDateTime(text) {
        return text ? new Date(text) : null;
      }

      // One row from GET /applications -> what the "My applications" screen uses.
      function fromApplication(row) {
        return {
          id: row.id,
          number: row.applicationNumber,
          status: row.status,
          submittedAt: toDateTime(row.submittedAt),
          jobId: row.job ? row.job.id : null,
          jobTitle: row.job ? row.job.title : ''
        };
      }

      // Form model -> the body Apex expects.
      // The Apex class (salesforce/.../ApplicationsResource.cls) reads the
      // top-level "application" key and copies only these fields. There is no
      // email: the server takes it from the signed-in account.
      function toSalesforceApplication(jobId, form) {
        return {
          application: {
            Job__c: jobId,
            Full_Name__c: form.fullName,
            Phone__c: form.phone || null,
            Work_Authorization__c: form.workAuthorization,
            Resume_URL__c: form.resumeUrl
          }
        };
      }

      return {
        // GET /jobs -> promise of [job, job, ...]
        getAll: function () {
          return $http.get(API_URL + '/jobs').then(function (response) {
            return response.data.map(fromSalesforce);
          });
        },

        // GET /jobs/{id} -> promise of one job
        getById: function (id) {
          return $http.get(API_URL + '/jobs/' + encodeURIComponent(id)).then(function (response) {
            return fromSalesforce(response.data);
          });
        },

        // POST /applications -> promise of { id, status }   (needs a signed-in candidate)
        apply: function (jobId, form) {
          return $http.post(API_URL + '/applications', toSalesforceApplication(jobId, form))
            .then(function (response) { return response.data; });
        },

        // GET /applications -> promise of the signed-in candidate's applications, newest first
        getMyApplications: function () {
          return $http.get(API_URL + '/applications').then(function (response) {
            return response.data.map(fromApplication);
          });
        }
      };
    }]);
})();
