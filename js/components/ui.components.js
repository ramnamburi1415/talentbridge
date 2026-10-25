/*
 * ui.components.js — small reusable pieces used on more than one screen.
 *
 * Components (AngularJS 1.5+) are simple directives with an isolated scope.
 * The rule followed here: data comes IN through bindings ('<' one-way, '@' text)
 * and nothing calls the API. That keeps them easy to reuse and to test.
 */
(function () {
  'use strict';

  angular.module('talentBridge')

    // <location-badge value="job.workLocation"></location-badge>
    // A coloured pill: Onsite, Hybrid or Remote.
    .component('locationBadge', {
      bindings: { value: '<' },
      template: '<span class="badge-pill" ng-class="$ctrl.css">{{$ctrl.value}}</span>',
      controller: function () {
        var ctrl = this;
        var classes = { Onsite: 'pill-onsite', Hybrid: 'pill-hybrid', Remote: 'pill-remote' };

        // $onChanges runs on first render and whenever the bound value changes.
        ctrl.$onChanges = function () {
          ctrl.css = classes[ctrl.value] || 'pill-neutral';
        };
      }
    })

    // <job-card job="job"></job-card>
    // The phone layout of one job. The desktop table shows the same data in a row.
    .component('jobCard', {
      bindings: { job: '<' },
      template:
        '<article class="job-card">' +
          '<h3 class="job-card-title"><a href="#/jobs/{{$ctrl.job.id}}">{{$ctrl.job.title}}</a></h3>' +
          '<p class="job-card-meta">{{$ctrl.job.location}} <location-badge value="$ctrl.job.workLocation"></location-badge></p>' +
          '<p class="job-card-meta">{{$ctrl.job.employmentType}} &middot; {{$ctrl.job.experience}}+ yrs &middot; Posted {{$ctrl.job.postedDate | date:"MMM d"}}</p>' +
          '<ul class="chips">' +
            '<li ng-repeat="skill in $ctrl.job.skills | limitTo:4 track by $index">{{skill}}</li>' +
          '</ul>' +
        '</article>'
    })

    // <state-panel state="vm.state" message="vm.errorMessage" on-retry="vm.load()">
    //   what to show when state is 'empty'
    // </state-panel>
    // Draws loading, error and empty the same way on every screen.
    .component('statePanel', {
      transclude: true,
      bindings: { state: '<', message: '<', loadingText: '@', onRetry: '&' },
      template:
        '<div class="state-panel" ng-if="$ctrl.state === \'loading\'" role="status">' +
          '<span class="spinner" aria-hidden="true"></span>' +
          '<p>{{$ctrl.loadingText || \'Loading...\'}}</p>' +
        '</div>' +
        '<div class="state-panel state-error" ng-if="$ctrl.state === \'error\'" role="alert">' +
          '<h2>Something went wrong</h2>' +
          '<p>{{$ctrl.message}}</p>' +
          '<button type="button" class="btn btn-primary" ng-click="$ctrl.onRetry()">Try again</button>' +
        '</div>' +
        '<div class="state-panel" ng-if="$ctrl.state === \'empty\'" ng-transclude></div>'
    });
})();
