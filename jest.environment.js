const { default: BaseEnvironment } = require('@jest/environment-jsdom-abstract');
const jsdom = require('jsdom');

// Jest's extension point lets us use current jsdom without its legacy DOM bundle.
module.exports = class JSDOMEnvironment extends BaseEnvironment {
  constructor(config, context) {
    super(config, context, jsdom);
  }
};
