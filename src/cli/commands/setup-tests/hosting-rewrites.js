const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');

class HostingRewritesTest extends BaseTest {
  getName() {
    return 'hosting rewrites have bm_api';
  }

  async run() {
    const rewrites = this.self.firebaseJSON?.hosting?.rewrites || [];
    const firstRewrite = rewrites[0];

    // Check first rule is correct
    const firstIsCorrect = firstRewrite?.source === '{/backend-manager,/backend-manager/**}' && firstRewrite?.function === 'bm_api';

    // Check no duplicates exist (only one bm_api rule allowed)
    const bmApiCount = rewrites.filter(r => r.function === 'bm_api').length;

    return firstIsCorrect && bmApiCount === 1;
  }

  async fix() {
    const hosting = this.self.firebaseJSON?.hosting || {};

    // Set default
    hosting.rewrites = hosting.rewrites || [];

    // Remove any existing bm_api rewrites
    hosting.rewrites = hosting.rewrites.filter(rewrite => rewrite.function !== 'bm_api');

    // Add to top
    hosting.rewrites.unshift({
      source: '{/backend-manager,/backend-manager/**}',
      function: 'bm_api',
    });

    // Set
    _.set(this.self.firebaseJSON, 'hosting.rewrites', hosting.rewrites);

    // Write
    jetpack.write(`${this.self.firebaseProjectPath}/firebase.json`, JSON.stringify(this.self.firebaseJSON, null, 2));
  }
}

module.exports = HostingRewritesTest;
