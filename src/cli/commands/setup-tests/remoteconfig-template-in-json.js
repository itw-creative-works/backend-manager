const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');

class RemoteconfigTemplateInJsonTest extends BaseTest {
  getName() {
    return 'remoteconfig template in JSON';
  }

  async run() {
    return this.self.firebaseJSON?.remoteconfig?.template === 'remoteconfig.template.json';
  }

  async fix() {
    _.set(this.self.firebaseJSON, 'remoteconfig.template', 'remoteconfig.template.json');
    jetpack.write(`${this.self.firebaseProjectPath}/firebase.json`, JSON.stringify(this.self.firebaseJSON, null, 2));
  }
}

module.exports = RemoteconfigTemplateInJsonTest;
