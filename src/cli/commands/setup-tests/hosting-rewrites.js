const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');

// The expected source pattern for bm_api hosting rewrite
// Includes /backend-manager/* routes and root-level MCP OAuth paths
// that Claude Chat sends directly (e.g. /authorize, /token, /.well-known/*)
const BM_API_SOURCE = '{/backend-manager,/backend-manager/**,/.well-known/oauth-protected-resource,/.well-known/oauth-authorization-server,/authorize,/token}';

class HostingRewritesTest extends BaseTest {
  getName() {
    return 'hosting rewrites have bm_api';
  }

  async run() {
    const rewrites = this.self.firebaseJSON?.hosting?.rewrites || [];
    const firstRewrite = rewrites[0];

    // Check first rule is correct (matches current expected pattern)
    const firstIsCorrect = firstRewrite?.source === BM_API_SOURCE && firstRewrite?.function === 'bm_api';

    // Check no duplicates exist (only one bm_api rule allowed)
    const bmApiCount = rewrites.filter(r => r.function === 'bm_api').length;

    return firstIsCorrect && bmApiCount === 1;
  }

  async fix() {
    const hosting = this.self.firebaseJSON?.hosting || {};

    // Set default
    hosting.rewrites = hosting.rewrites || [];

    // Remove any existing bm_api rewrites (handles legacy single-pattern rewrites too)
    hosting.rewrites = hosting.rewrites.filter(rewrite => rewrite.function !== 'bm_api');

    // Add to top with full pattern including MCP OAuth paths
    hosting.rewrites.unshift({
      source: BM_API_SOURCE,
      function: 'bm_api',
    });

    // Set
    _.set(this.self.firebaseJSON, 'hosting.rewrites', hosting.rewrites);

    // Write
    jetpack.write(`${this.self.firebaseProjectPath}/firebase.json`, JSON.stringify(this.self.firebaseJSON, null, 2));
  }
}

module.exports = HostingRewritesTest;
