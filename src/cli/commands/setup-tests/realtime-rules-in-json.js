const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');

class RealtimeRulesInJsonTest extends BaseTest {
  getName() {
    return 'realtime rules in JSON';
  }

  async run() {
    return this.self.firebaseJSON?.database?.rules === 'database.rules.json';
  }

  async fix() {
    _.set(this.self.firebaseJSON, 'database.rules', 'database.rules.json');
    jetpack.write(`${this.self.firebaseProjectPath}/firebase.json`, JSON.stringify(this.self.firebaseJSON, null, 2));
  }
}

module.exports = RealtimeRulesInJsonTest;
