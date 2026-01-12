/**
 * Test: user:resolve
 * Tests the user resolve command
 * Returns user account info for authenticated users
 *
 * SKIPPED: The user:resolve command is not yet implemented (has TODO in handler)
 */
module.exports = {
  description: 'User resolve (account info)',
  skip: 'user:resolve command not yet implemented',
  type: 'group',
  tests: [
    // Test 1: Authenticated user can call resolve
    {
      name: 'authenticated-user-succeeds',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:resolve', {});

        assert.isSuccess(response, 'Resolve should succeed for authenticated user');
      },
    },

    // Test 2: Premium user can call resolve
    {
      name: 'premium-user-succeeds',
      auth: 'premium-active',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:resolve', {});

        assert.isSuccess(response, 'Resolve should succeed for premium user');
      },
    },

    // Test 3: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:resolve', {});

        assert.isError(response, 401, 'Resolve should fail without authentication');
      },
    },
  ],
};
