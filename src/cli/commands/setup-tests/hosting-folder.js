const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');

class HostingFolderTest extends BaseTest {
  getName() {
    return 'hosting is set to dedicated folder in JSON';
  }

  async run() {
    const self = this.self;
    const hosting = _.get(self.firebaseJSON, 'hosting', {});
    return (hosting.public && (hosting.public === 'public' || hosting.public !== '.'));
  }

  async fix() {
    const self = this.self;
    _.set(self.firebaseJSON, 'hosting.public', 'public');
    jetpack.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
  }
}

module.exports = HostingFolderTest;
