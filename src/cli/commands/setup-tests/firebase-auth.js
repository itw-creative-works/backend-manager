const BaseTest = require('./base-test');
const powertools = require('node-powertools');

class FirebaseAuthTest extends BaseTest {
  getName() {
    return 'firebase CLI is authenticated';
  }

  getWarning() {
    return [
      'You are not logged in to Firebase.',
      'Run: firebase login',
    ];
  }

  async run() {
    try {
      await powertools.execute('firebase projects:list', { log: false });
      return true;
    } catch (error) {
      return 'warn';
    }
  }
}

module.exports = FirebaseAuthTest;
