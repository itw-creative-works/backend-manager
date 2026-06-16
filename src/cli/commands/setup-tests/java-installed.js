const BaseTest = require('./base-test');
const powertools = require('node-powertools');

class JavaInstalledTest extends BaseTest {
  getName() {
    return 'Java is installed (required by Firebase emulators)';
  }

  getWarning() {
    return [
      'Java is required by the Firebase Firestore emulator (used for testing).',
      'Install with: brew install openjdk',
    ];
  }

  async run() {
    try {
      await powertools.execute('java -version', { log: false });
      return true;
    } catch (error) {
      return 'warn';
    }
  }
}

module.exports = JavaInstalledTest;
