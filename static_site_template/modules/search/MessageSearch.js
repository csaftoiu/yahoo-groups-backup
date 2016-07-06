'use strict';

angular.module('staticyahoo.search')

  /**
   * Proxy for either local or remote search.
   */
  .factory('MessageSearch', function ($injector) {
    return $injector.get('MessageSearch__Local');
  })

;
