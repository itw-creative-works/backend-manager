/**
 * Test: GET /user
 * Tests the user resolve endpoint
 * Returns user account info for authenticated users
 *
 * SKIPPED: The user resolve endpoint is not yet implemented (has TODO in handler)
 */
module.exports = {
  description: 'User resolve (account info)',
  skip: 'GET /user endpoint not yet implemented',
  type: 'group',
  tests: [
    // Test 1: Authenticated user can call resolve
    {
      name: 'authenticated-user-succeeds',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('user', {});

        assert.isSuccess(response, 'Resolve should succeed for authenticated user');
      },
    },

    // Test 2: Premium user can call resolve
    {
      name: 'premium-user-succeeds',
      auth: 'premium-active',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('user', {});

        assert.isSuccess(response, 'Resolve should succeed for premium user');
      },
    },

    // Test 3: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('user', {});

        assert.isError(response, 401, 'Resolve should fail without authentication');
      },
    },
  ],
};
