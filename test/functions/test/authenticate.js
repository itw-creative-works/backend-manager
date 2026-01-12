/**
 * Test: test:authenticate
 * Tests different authentication methods
 */
module.exports = {
  description: 'Authentication methods',
  type: 'group',
  tests: [
    // Test 1: Unauthenticated request
    {
      name: 'no-auth',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.command('test:authenticate', {});

        assert.isSuccess(response, 'Should succeed without auth');
        assert.equal(response.data.user.authenticated, false, 'User should not be authenticated');
      },
    },

    // Test 2: Private key authentication
    {
      name: 'private-key',
      auth: 'basic',
      async run({ http, assert, accounts }) {
        const response = await http.command('test:authenticate', {});

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
        const response = await http.post('/bm_api', {
          command: 'test:authenticate',
          payload: {},
        }, {
          headers: { 'Authorization': 'Bearer invalid-key-12345' },
        });

        assert.isSuccess(response, 'Should succeed but not authenticate');
        assert.equal(response.data.user.authenticated, false, 'Invalid key should not authenticate');
      },
    },

    // Test 4: Admin (backendManagerKey) authentication
    {
      name: 'backend-manager-key',
      auth: 'admin',
      async run({ http, assert }) {
        const response = await http.command('test:authenticate', {});

        assert.isSuccess(response, 'Should succeed with backendManagerKey');
        assert.equal(response.data.user.authenticated, true, 'User should be authenticated');
        assert.equal(response.data.user.roles?.admin, true, 'Should have admin role');
      },
    },
  ],
};
