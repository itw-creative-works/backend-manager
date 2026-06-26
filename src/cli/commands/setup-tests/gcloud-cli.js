const BaseTest = require('./base-test');
const powertools = require('node-powertools');

class GcloudCliTest extends BaseTest {
  getName() {
    return 'gcloud CLI is installed (required by deploy)';
  }

  getWarning() {
    return [
      'gcloud CLI is not installed.',
      'Install with: https://cloud.google.com/sdk/docs/install',
    ];
  }

  async run() {
    try {
      await powertools.execute('gcloud --version', { log: false });
      return true;
    } catch (error) {
      return 'warn';
    }
  }
}

module.exports = GcloudCliTest;
