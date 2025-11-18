const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');

class FirestoreRulesInJsonTest extends BaseTest {
  getName() {
    return 'firestore rules in JSON';
  }

  async run() {
    return this.self.firebaseJSON?.firestore?.rules === 'firestore.rules';
  }

  async fix() {
    _.set(this.self.firebaseJSON, 'firestore.rules', 'firestore.rules');
    jetpack.write(`${this.self.firebaseProjectPath}/firebase.json`, JSON.stringify(this.self.firebaseJSON, null, 2));
  }
}

module.exports = FirestoreRulesInJsonTest;
