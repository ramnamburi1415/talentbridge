/*
 * match.directive.js — a custom validator: "this field must equal that one".
 *
 *   <input name="confirmPassword" ng-model="vm.form.confirmPassword" tb-match="vm.form.password">
 *   <div ng-messages="registerForm.confirmPassword.$error">
 *     <div ng-message="match">Passwords don't match.</div>
 *   </div>
 *
 * How it works:
 *   require: 'ngModel' gives us this input's NgModelController.
 *   $validators.match runs whenever THIS field changes, and its result becomes
 *   $error.match (and makes the whole form $invalid when false).
 *   The $watch re-checks when the OTHER field changes, because Angular only
 *   validates a field when its own value changes.
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .directive('tbMatch', function () {
      return {
        restrict: 'A',
        require: 'ngModel',
        link: function (scope, element, attrs, ngModel) {
          ngModel.$validators.match = function (value) {
            // Empty is "required"'s job, not ours.
            return !value || value === scope.$eval(attrs.tbMatch);
          };

          scope.$watch(attrs.tbMatch, function () {
            ngModel.$validate();
          });
        }
      };
    });
})();
