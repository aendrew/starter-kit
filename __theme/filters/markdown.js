const md = require('../../__builder/markdown');

module.exports = function (str) {
  return this.env.filters.safe(md.render(str));
};
