const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const path = require('path');

class BackendManagerTestsFileTest extends BaseTest {
  getName() {
    return 'update backend-manager-tests.js';
  }

  async run() {
    const self = this.self;
    jetpack.write(`${self.firebaseProjectPath}/test/backend-manager-tests.js`,
      (jetpack.read(path.resolve(`${__dirname}/../../../../templates/backend-manager-tests.js`)))
    );
    return true;
  }

  async fix() {
    throw new Error('No automatic fix available for this test');
  }
}

module.exports = BackendManagerTestsFileTest;
