const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');

class HostingRewritesTest extends BaseTest {
  getName() {
    return 'hosting rewrites have bm_api';
  }

  async run() {
    return this.self.firebaseJSON?.hosting?.rewrites?.some(rewrite => rewrite.source === '/backend-manager' && rewrite.function === 'bm_api');
  }

  async fix() {
    const hosting = this.self.firebaseJSON?.hosting || {};

    // Set default
    hosting.rewrites = hosting.rewrites || [];

    // Add to top
    hosting.rewrites.unshift({
      source: '/backend-manager',
      function: 'bm_api',
    });

    // Set
    _.set(this.self.firebaseJSON, 'hosting.rewrites', hosting.rewrites);

    // Write
    jetpack.write(`${this.self.firebaseProjectPath}/firebase.json`, JSON.stringify(this.self.firebaseJSON, null, 2));
  }
}

module.exports = HostingRewritesTest;
