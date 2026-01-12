const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const chalk = require('chalk');

// Legacy test files that should be removed from consuming projects
const LEGACY_FILES = [
  'test/accounts.json',
  'test/backend-manager-tests.js',
];

class LegacyTestsCleanupTest extends BaseTest {
  getName() {
    return 'remove legacy test files';
  }

  async run() {
    const self = this.self;

    // Check if any legacy files exist
    for (const file of LEGACY_FILES) {
      const filePath = `${self.firebaseProjectPath}/${file}`;
      if (jetpack.exists(filePath)) {
        return false;
      }
    }

    return true;
  }

  async fix() {
    const self = this.self;

    for (const file of LEGACY_FILES) {
      const filePath = `${self.firebaseProjectPath}/${file}`;
      if (jetpack.exists(filePath)) {
        jetpack.remove(filePath);
        console.log(chalk.yellow(`Removed legacy file: ${file}`));
      }
    }
  }
}

module.exports = LegacyTestsCleanupTest;
