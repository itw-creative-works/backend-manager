const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');

const HOOKS_DIRS = [
  'hooks/auth',
  'hooks/cron/daily',
];

class HooksDirectoriesTest extends BaseTest {
  getName() {
    return 'hooks directories exist';
  }

  async run() {
    const self = this.self;
    const functionsDir = `${self.firebaseProjectPath}/functions`;

    for (const dir of HOOKS_DIRS) {
      jetpack.dir(`${functionsDir}/${dir}`);
    }

    return true;
  }

  async fix() {
    throw new Error('No automatic fix available for this test');
  }
}

module.exports = HooksDirectoriesTest;
