const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');

class StorageRulesInJsonTest extends BaseTest {
  getName() {
    return 'storage rules in JSON';
  }

  async run() {
    return this.self.firebaseJSON?.storage?.rules === 'storage.rules';
  }

  async fix() {
    _.set(this.self.firebaseJSON, 'storage.rules', 'storage.rules');
    jetpack.write(`${this.self.firebaseProjectPath}/firebase.json`, JSON.stringify(this.self.firebaseJSON, null, 2));
  }
}

module.exports = StorageRulesInJsonTest;
