/**
 * Test: POST /user/token
 * Tests the user create custom token endpoint
 * Requires user authentication (uses Api.resolveUser with adminRequired: true which means user must be authenticated)
 */
module.exports = {
  description: 'User create custom token',
  type: 'group',
  tests: [
    // Test 1: Authenticated user can create custom token
    {
      name: 'authenticated-user-succeeds',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('user/token', {});

        assert.isSuccess(response, 'Create custom token should succeed for authenticated user');
        assert.hasProperty(response, 'data.token', 'Response should contain token');
        assert.ok(
          typeof response.data.token === 'string' && response.data.token.length > 0,
          'Token should be a non-empty string'
        );
      },
    },

    // Test 2: Token has valid JWT format
    {
      name: 'token-is-valid-jwt',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('user/token', {});

        assert.isSuccess(response, 'Create custom token should succeed');

        // JWT tokens have 3 parts separated by dots
        const parts = response.data.token.split('.');
        assert.equal(parts.length, 3, 'Token should be a valid JWT with 3 parts');
      },
    },

    // Test 3: Premium user can create custom token
    // Note: Admin via backendManagerKey can't create tokens without a UID since it's not a real user
    {
      name: 'premium-user-succeeds',
      auth: 'premium-active',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('user/token', {});

        assert.isSuccess(response, 'Create custom token should succeed for premium user');
        assert.hasProperty(response, 'data.token', 'Response should contain token');
      },
    },

    // Test 4: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('user/token', {});

        assert.isError(response, 401, 'Create custom token should fail without authentication');
      },
    },
  ],
};
