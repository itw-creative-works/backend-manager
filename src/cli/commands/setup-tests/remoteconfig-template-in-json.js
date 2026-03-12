const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');

const ENABLED = false;

class RemoteconfigTemplateInJsonTest extends BaseTest {
  getName() {
    return 'remoteconfig template in JSON';
  }

  async run() {
    if (ENABLED) {
      return this.self.firebaseJSON?.remoteconfig?.template === 'remoteconfig.template.json';
    }

    return !this.self.firebaseJSON?.remoteconfig;
  }

  async fix() {
    if (ENABLED) {
      _.set(this.self.firebaseJSON, 'remoteconfig.template', 'remoteconfig.template.json');
    } else {
      delete this.self.firebaseJSON.remoteconfig;
    }

    jetpack.write(`${this.self.firebaseProjectPath}/firebase.json`, JSON.stringify(this.self.firebaseJSON, null, 2));
  }
}

module.exports = RemoteconfigTemplateInJsonTest;
