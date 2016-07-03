'use strict';

angular.module('staticyahoo.index')

  /**
   * Proxy for either local or remote index data.
   */
  .factory('IndexData', function ($injector) {
    return $injector.get('IndexData__Local');
  })

;
