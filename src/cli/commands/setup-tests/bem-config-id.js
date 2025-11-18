const BaseTest = require('./base-test');
const chalk = require('chalk');

class BemConfigIdTest extends BaseTest {
  getName() {
    return 'has correct ID in backend-manager-config.json';
  }

  async run() {
    // Check if the project name matches the projectId
    if (this.self.projectId !== this.self.bemConfigJSON?.firebaseConfig?.projectId) {
      console.error(chalk.red('Mismatch between project name and firebaseConfig.projectId in backend-manager-config.json'));
      return false;
    }

    // Return pass
    return true;
  }

  async fix() {
    throw new Error('No automatic fix available for this test');
  }
}

module.exports = BemConfigIdTest;
