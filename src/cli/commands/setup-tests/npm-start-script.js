const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');

class NpmStartScriptTest extends BaseTest {
  getName() {
    return 'has "npm start" script';
  }

  async run() {
    return !!this.context.package.scripts.start;
  }

  async fix() {
    _.set(this.context.package, 'scripts.start', 'firebase serve');
    jetpack.write(`${this.self.firebaseProjectPath}/functions/package.json`, JSON.stringify(this.context.package, null, 2));
  }
}

module.exports = NpmStartScriptTest;
