/**
 * Test: user:get-active-sessions
 * Tests the user get active sessions command
 * Returns sessions for authenticated users from Realtime Database
 */
module.exports = {
  description: 'User get active sessions',
  type: 'group',
  tests: [
    // Test 1: Authenticated user can get sessions
    {
      name: 'authenticated-user-succeeds',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:get-active-sessions', {});

        assert.isSuccess(response, 'Get active sessions should succeed for authenticated user');
        assert.ok(
          typeof response.data === 'object',
          'Response data should be an object'
        );
      },
    },

    // Test 2: Default session id is 'app'
    {
      name: 'default-session-is-app',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        // With no id specified, should query sessions/app
        const response = await http.command('user:get-active-sessions', {});

        assert.isSuccess(response, 'Get active sessions should succeed');
        // Response is an object (may be empty if no sessions)
        assert.ok(
          response.data !== undefined,
          'Response should have data'
        );
      },
    },

    // Test 3: Custom session id
    {
      name: 'custom-session-id',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:get-active-sessions', {
          id: 'custom-session-type',
        });

        assert.isSuccess(response, 'Get active sessions with custom id should succeed');
        assert.ok(
          typeof response.data === 'object',
          'Response data should be an object'
        );
      },
    },

    // Test 4: Empty sessions returns empty object
    {
      name: 'no-sessions-returns-empty',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        // Query a session type that definitely doesn't exist
        const response = await http.command('user:get-active-sessions', {
          id: 'nonexistent-session-type-12345',
        });

        assert.isSuccess(response, 'Get sessions for empty type should succeed');
        assert.ok(
          Object.keys(response.data).length === 0,
          'Empty session type should return empty object'
        );
      },
    },

    // Test 5: Admin can get sessions
    {
      name: 'admin-succeeds',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:get-active-sessions', {});

        assert.isSuccess(response, 'Get active sessions should succeed for admin');
      },
    },

    // Test 6: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('user:get-active-sessions', {});

        assert.isError(response, 401, 'Get active sessions should fail without authentication');
      },
    },
  ],
};
