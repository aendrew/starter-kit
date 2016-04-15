'use strict';

module.exports = require('markdown-it')({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true
})
// https://www.npmjs.com/package/markdown-it-emoji
.use(require('markdown-it-emoji'))
// https://www.npmjs.com/package/markdown-it-attrs
.use(require('markdown-it-attrs'))
// https://www.npmjs.com/package/markdown-it-checkbox
.use(require('markdown-it-checkbox'))
// https://www.npmjs.com/package/markdown-it-title
.use(require('markdown-it-title'))
// https://www.npmjs.com/package/markdown-it-named-headers
.use(require('markdown-it-named-headers'))
;
