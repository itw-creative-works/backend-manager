const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');

const DIRS = [
  'routes',
  'schemas',
  'hooks/auth',
  'hooks/cron/daily',
];

class ProjectDirectoriesTest extends BaseTest {
  getName() {
    return 'project directories exist';
  }

  async run() {
    const self = this.self;
    const functionsDir = `${self.firebaseProjectPath}/functions`;

    for (const dir of DIRS) {
      jetpack.dir(`${functionsDir}/${dir}`);
    }

    return true;
  }

  async fix() {
    throw new Error('No automatic fix available for this test');
  }
}

module.exports = ProjectDirectoriesTest;
