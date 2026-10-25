/*
 * success-modal.directive.js — the ONE place this app uses jQuery directly.
 *
 * Wraps Bootstrap's jQuery modal plugin so templates can stay declarative:
 *
 *   <success-modal visible="vm.submitted" heading="Application submitted"
 *                  on-close="vm.finish()">
 *     body content
 *   </success-modal>
 *
 * Three things worth explaining in an interview:
 *  1. Plugin and DOM code lives in a directive's link function, never in a controller.
 *  2. Bootstrap fires 'hidden.bs.modal' outside AngularJS, so the callback is run
 *     with $applyAsync to start a digest cycle; otherwise the view would not update.
 *  3. On $destroy (route change) the handler is removed and the modal hidden,
 *     so no listeners or dark backdrops are left behind.
 */
(function () {
  'use strict';

  angular.module('talentBridge')
    .directive('successModal', function () {
      return {
        restrict: 'E',
        transclude: true,
        scope: {
          visible: '<',
          heading: '@',
          buttonLabel: '@',
          onClose: '&'
        },
        template:
          '<div class="modal fade" tabindex="-1" role="dialog" aria-labelledby="successModalTitle">' +
            '<div class="modal-dialog" role="document">' +
              '<div class="modal-content">' +
                '<div class="modal-header">' +
                  '<h4 class="modal-title" id="successModalTitle">{{heading}}</h4>' +
                '</div>' +
                '<div class="modal-body" ng-transclude></div>' +
                '<div class="modal-footer">' +
                  '<button type="button" class="btn btn-primary" data-dismiss="modal">{{buttonLabel || \'Close\'}}</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>',

        link: function (scope, element) {
          var $modal = $(element).children('.modal');

          // Create the plugin instance once, hidden.
          $modal.modal({ show: false, backdrop: 'static' });

          // AngularJS -> plugin: open when "visible" becomes truthy.
          scope.$watch('visible', function (visible) {
            if (visible) { $modal.modal('show'); }
          });

          // Plugin -> AngularJS: when it has closed, tell the parent.
          $modal.on('hidden.bs.modal', function () {
            scope.$applyAsync(function () { scope.onClose(); });
          });

          // Clean up when the screen goes away.
          scope.$on('$destroy', function () {
            $modal.off('hidden.bs.modal');
            $modal.removeClass('fade').modal('hide');
            $modal.removeData('bs.modal');
          });
        }
      };
    });
})();
