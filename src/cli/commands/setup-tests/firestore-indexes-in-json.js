const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');

class FirestoreIndexesInJsonTest extends BaseTest {
  getName() {
    return 'firestore indexes in JSON';
  }

  async run() {
    return this.self.firebaseJSON?.firestore?.indexes === 'firestore.indexes.json';
  }

  async fix() {
    _.set(this.self.firebaseJSON, 'firestore.indexes', 'firestore.indexes.json');
    jetpack.write(`${this.self.firebaseProjectPath}/firebase.json`, JSON.stringify(this.self.firebaseJSON, null, 2));
  }
}

module.exports = FirestoreIndexesInJsonTest;
