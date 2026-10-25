/*
 * job-board.controller.js — the job list screen (views/job-board.html).
 *
 * State machine: vm.state is ONE of 'loading' | 'ready' | 'empty' | 'error'.
 * Using a single value means two states can never show at the same time.
 *
 * Data:
 *   vm.jobs     every job the API returned (never filtered)
 *   vm.visible  the jobs after search, filters and sort (what the screen shows)
 *
 * Filtering runs in applyFilters(), called only when a filter changes, instead
 * of a filter in the template that would re-run on every digest cycle.
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .controller('JobBoardCtrl', [
      '$filter', 'JobService', 'ApiError', 'WORK_LOCATIONS', 'EMPLOYMENT_TYPES',
      function ($filter, JobService, ApiError, WORK_LOCATIONS, EMPLOYMENT_TYPES) {
        var vm = this;

        vm.workLocations = WORK_LOCATIONS;
        vm.employmentTypes = EMPLOYMENT_TYPES;

        vm.jobs = [];
        vm.visible = [];
        vm.state = 'loading';
        vm.errorMessage = '';
        vm.filters = emptyFilters();
        vm.sort = { field: 'postedDate', reverse: true };   // newest first

        // Kendo Grid needs a commercial licence, so it is optional (see README).
        // Without it the board uses a plain table on desktop and cards on phones.
        vm.useGrid = !!(window.kendo && window.kendo.ui && window.kendo.ui.Grid);

        function emptyFilters() {
          return { search: '', workLocation: '', employmentType: '' };
        }

        // ---- Loading -------------------------------------------------------

        vm.load = function () {
          vm.state = 'loading';
          JobService.getAll()
            .then(function (jobs) {                 // success: promise resolved
              vm.jobs = jobs;
              vm.state = jobs.length ? 'ready' : 'empty';
              vm.applyFilters();
            })
            .catch(function (response) {            // failure: promise rejected
              vm.errorMessage = ApiError.message(response);
              vm.state = 'error';
            });
        };

        // ---- Search, filters, sort -----------------------------------------

        vm.applyFilters = function () {
          var f = vm.filters;
          var term = (f.search || '').trim().toLowerCase();

          var matches = vm.jobs.filter(function (job) {
            var haystack = (job.title + ' ' + job.skills.join(' ') + ' ' + job.location).toLowerCase();
            return (!term || haystack.indexOf(term) !== -1) &&
              (!f.workLocation || job.workLocation === f.workLocation) &&
              (!f.employmentType || job.employmentType === f.employmentType);
          });

          vm.visible = $filter('orderBy')(matches, vm.sort.field, vm.sort.reverse);

          // Kendo Grid keeps its own copy of the rows, so hand it the new list.
          if (vm.gridOptions) { vm.gridOptions.dataSource.data(vm.visible); }
        };

        vm.hasFilters = function () {
          var f = vm.filters;
          return !!(f.search || f.workLocation || f.employmentType);
        };

        vm.clearFilters = function () {
          vm.filters = emptyFilters();
          vm.applyFilters();
        };

        vm.sortBy = function (field) {
          // Same column again flips the direction; a new column starts ascending.
          vm.sort.reverse = (vm.sort.field === field) ? !vm.sort.reverse : false;
          vm.sort.field = field;
          vm.applyFilters();
        };

        // For screen readers: tells them how each column is sorted.
        vm.ariaSort = function (field) {
          if (vm.sort.field !== field) { return 'none'; }
          return vm.sort.reverse ? 'descending' : 'ascending';
        };

        // ---- Optional Kendo Grid -------------------------------------------

        if (vm.useGrid) {
          vm.gridOptions = {
            dataSource: new kendo.data.DataSource({ data: [], pageSize: 10 }),
            sortable: true,
            pageable: { pageSizes: [10, 25] },
            columns: [
              { field: 'title', title: 'Job title',
                template: '<strong>{{dataItem.title}}</strong><div class="text-muted small">{{dataItem.skills.slice(0, 3).join(", ")}}</div>' },
              { field: 'location', title: 'Location',
                template: '{{dataItem.location}}<br><location-badge value="dataItem.workLocation"></location-badge>' },
              { field: 'employmentType', title: 'Type' },
              { field: 'experience', title: 'Exp.', width: 90, template: '{{dataItem.experience}}+ yrs' },
              { field: 'postedDate', title: 'Posted', width: 120, template: '{{dataItem.postedDate | date:"MMM d"}}' },
              { title: '', width: 90,
                template: '<a class="btn btn-default btn-sm" href="#/jobs/{{dataItem.id}}">View</a>' }
            ]
          };
        }

        vm.load();
      }
    ]);
})();
