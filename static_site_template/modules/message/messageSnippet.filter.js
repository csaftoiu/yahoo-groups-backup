'use strict';

angular.module('staticyahoo.message')

  /**
   * Turn an (HTML) messageBody into a text-only snippet which looks
   * reasonable when presented as-is on one line.
   */
  .filter('messageSnippet', function ($filter) {
    var blockRegex = /^(address|blockquote|body|center|dir|div|dl|fieldset|form|h[1-6]|hr|isindex|menu|noframes|noscript|ol|p|pre|table|ul|dd|dt|frameset|li|tbody|td|tfoot|th|thead|tr|html)$/i;

    function isBlockLevel(el) {
      return blockRegex.test(el.nodeName);
    }

    return function (messageBody, maxLength) {
      maxLength = maxLength || 300;

      var html = messageBody;

      // do some manipulations before stripping out all elements
      var el = document.createElement('div');
      el.innerHTML = html;

      // pad with whitespace
      angular.forEach(el.getElementsByTagName("*"), function (el) {
        if (isBlockLevel(el)) {
          el.innerHTML = '\n' + el.innerHTML + '\n';
        } else {
          el.innerHTML = ' ' + el.innerHTML + ' ';
        }
      });

      // add newlines for <br>s
      angular.forEach(el.getElementsByTagName("br"), function (el) {
        el.outerHTML = '\n';
      });

      // remove <blockquote>s since these likely only contain
      // text we already saw
      // however, if this leaves us with no snippet whatsoever,
      // then leave the blockquotes in.
      var withBlockquotes = $filter('htmlToPlaintext')(el.innerHTML);
      angular.forEach(el.getElementsByTagName("blockquote"), function (el) {
        el.outerHTML = " ";
      });
      var withoutBlockquotes = $filter('htmlToPlaintext')(el.innerHTML);

      var fullText = withoutBlockquotes.length >= 50 ? withoutBlockquotes : withBlockquotes;

      // trim text
      if (fullText.length > maxLength) {
        fullText = fullText.slice(0, maxLength) + "...";
      }

      return fullText;
    };
  })

;
