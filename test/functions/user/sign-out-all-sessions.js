/**
 * Test: user:sign-out-all-sessions
 * Tests the user sign out all sessions command
 * This revokes refresh tokens and clears session data
 * Note: This is a potentially destructive test, so we use a dedicated test account
 */
module.exports = {
  description: 'User sign out all sessions',
  type: 'group',
  tests: [
    // Test 1: Authenticated user can sign out all sessions
    {
      name: 'authenticated-user-succeeds',
      auth: 'basic',
      timeout: 30000, // Longer timeout due to session cleanup

      async run({ http, assert }) {
        const response = await http.command('user:sign-out-all-sessions', {});

        assert.isSuccess(response, 'Sign out all sessions should succeed for authenticated user');
        assert.hasProperty(response, 'data.sessions', 'Response should contain sessions count');
        assert.hasProperty(response, 'data.message', 'Response should contain message');
        assert.ok(
          typeof response.data.sessions === 'number',
          'sessions should be a number'
        );
        assert.ok(
          response.data.sessions >= 0,
          'sessions count should be non-negative'
        );
      },
    },

    // Test 2: Custom session id
    {
      name: 'custom-session-id',
      auth: 'basic',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.command('user:sign-out-all-sessions', {
          id: 'custom-session-type',
        });

        assert.isSuccess(response, 'Sign out with custom session id should succeed');
        assert.hasProperty(response, 'data.sessions', 'Response should contain sessions count');
      },
    },

    // Test 3: Premium user can sign out all sessions
    // Note: backendManagerKey admin doesn't have auth.uid, so we test with premium user instead
    {
      name: 'premium-user-succeeds',
      auth: 'premium-active',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.command('user:sign-out-all-sessions', {});

        assert.isSuccess(response, 'Sign out all sessions should succeed for premium user');
        assert.hasProperty(response, 'data.sessions', 'Response should contain sessions count');
      },
    },

    // Test 4: Multiple calls are idempotent
    {
      name: 'idempotent-operation',
      auth: 'basic',
      timeout: 30000,

      async run({ http, assert }) {
        // Call twice in a row - both should succeed
        const response1 = await http.command('user:sign-out-all-sessions', {});
        const response2 = await http.command('user:sign-out-all-sessions', {});

        assert.isSuccess(response1, 'First sign out should succeed');
        assert.isSuccess(response2, 'Second sign out should succeed (idempotent)');
      },
    },

    // Test 5: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:sign-out-all-sessions', {});

        assert.isError(response, 401, 'Sign out all sessions should fail without authentication');
      },
    },
  ],
};
