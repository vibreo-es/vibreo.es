'use strict';

const engine = require('minimatch');

// Legacy ESLint plugins call require('minimatch') directly. All matching is
// delegated to the official package; do not mutate its shared function object.
module.exports = Object.assign((...args) => engine.minimatch(...args), engine);

// eslint-plugin-import only uses makeRe(pattern).test(path). Minimatch 11 no
// longer emits regexes: preserve that caller's interface using the safe matcher.
// This is intentionally not a general RegExp replacement.
module.exports.makeRe = (pattern, options) => {
  const matcher = new engine.Minimatch(pattern, options);
  return { test: path => matcher.match(path) };
};
