const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');

class NpmDistScriptTest extends BaseTest {
  getName() {
    return 'has "npm dist" script';
  }

  async run() {
    return !!this.context.package.scripts.dist;
  }

  async fix() {
    _.set(this.context.package, 'scripts.dist', 'firebase deploy');
    jetpack.write(`${this.self.firebaseProjectPath}/functions/package.json`, JSON.stringify(this.context.package, null, 2));
  }
}

module.exports = NpmDistScriptTest;
