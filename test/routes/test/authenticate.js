/**
 * Test: test/authenticate
 * Tests different authentication methods using new RESTful API
 */
module.exports = {
  description: 'Authentication methods (RESTful)',
  type: 'group',
  tests: [
    // Test 1: Unauthenticated request
    {
      name: 'no-auth',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.get('test/authenticate');

        assert.isSuccess(response, 'Should succeed without auth');
        assert.equal(response.data.user.authenticated, false, 'User should not be authenticated');
      },
    },

    // Test 2: Private key authentication
    {
      name: 'private-key',
      auth: 'basic',
      async run({ http, assert, accounts }) {
        const response = await http.as('basic').get('test/authenticate');

        assert.isSuccess(response, 'Should succeed with privateKey');
        assert.equal(response.data.user.authenticated, true, 'User should be authenticated');
        assert.equal(response.data.user.auth.uid, accounts.basic.uid, 'UID should match');
      },
    },

    // Test 3: Invalid private key
    {
      name: 'invalid-private-key',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.withPrivateKey('invalid-key-12345').get('test/authenticate');

        assert.isSuccess(response, 'Should succeed but not authenticate');
        assert.equal(response.data.user.authenticated, false, 'Invalid key should not authenticate');
      },
    },

    // Test 4: Admin (backendManagerKey) authentication
    {
      name: 'backend-manager-key',
      auth: 'admin',
      async run({ http, assert }) {
        const response = await http.as('admin').get('test/authenticate');

        assert.isSuccess(response, 'Should succeed with backendManagerKey');
        assert.equal(response.data.user.authenticated, true, 'User should be authenticated');
        assert.equal(response.data.user.roles?.admin, true, 'Should have admin role');
      },
    },
  ],
};
