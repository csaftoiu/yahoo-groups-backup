'use strict';

angular.module('staticyahoo.message')

  /**
   * Proxy for either local or remote message data.
   */
  .factory('MessageData', function ($injector) {
    return $injector.get('MessageData__Local');
  })

;