const BaseTest = require('./base-test');
const powertools = require('node-powertools');

class FirebaseCliTest extends BaseTest {
  getName() {
    return 'firebase CLI is installed';
  }

  getWarning() {
    return [
      'Firebase CLI is not installed.',
      'Install with: npm install -g firebase-tools',
    ];
  }

  async run() {
    try {
      await powertools.execute('firebase --version', { log: false });
      return true;
    } catch (error) {
      return 'warn';
    }
  }
}

module.exports = FirebaseCliTest;
