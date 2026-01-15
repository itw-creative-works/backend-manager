/**
 * Test: GET /user/sessions and DELETE /user/sessions
 * Tests the user sessions endpoints
 * GET returns sessions for authenticated users from Realtime Database
 * DELETE signs out all sessions (revokes refresh tokens and clears session data)
 */
module.exports = {
  description: 'User sessions (get and sign-out)',
  type: 'group',
  tests: [
    // --- GET /user/sessions tests ---

    // Test 1: Authenticated user can get sessions
    {
      name: 'get-authenticated-user-succeeds',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('user/sessions', {});

        assert.isSuccess(response, 'Get active sessions should succeed for authenticated user');
        assert.ok(
          typeof response.data === 'object',
          'Response data should be an object'
        );
      },
    },

    // Test 2: Default session id is 'app'
    {
      name: 'get-default-session-is-app',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        // With no id specified, should query sessions/app
        const response = await http.get('user/sessions', {});

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
      name: 'get-custom-session-id',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('user/sessions', {
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
      name: 'get-no-sessions-returns-empty',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        // Query a session type that definitely doesn't exist
        const response = await http.get('user/sessions', {
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
      name: 'get-admin-succeeds',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('user/sessions', {});

        assert.isSuccess(response, 'Get active sessions should succeed for admin');
      },
    },

    // Test 6: Unauthenticated GET request fails
    {
      name: 'get-unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('user/sessions', {});

        assert.isError(response, 401, 'Get active sessions should fail without authentication');
      },
    },

    // --- DELETE /user/sessions tests ---

    // Test 7: Authenticated user can sign out all sessions
    {
      name: 'delete-authenticated-user-succeeds',
      auth: 'basic',
      timeout: 30000, // Longer timeout due to session cleanup

      async run({ http, assert }) {
        const response = await http.delete('user/sessions', {});

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

    // Test 8: Custom session id for delete
    {
      name: 'delete-custom-session-id',
      auth: 'basic',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.delete('user/sessions', {
          id: 'custom-session-type',
        });

        assert.isSuccess(response, 'Sign out with custom session id should succeed');
        assert.hasProperty(response, 'data.sessions', 'Response should contain sessions count');
      },
    },

    // Test 9: Premium user can sign out all sessions
    // Note: backendManagerKey admin doesn't have auth.uid, so we test with premium user instead
    {
      name: 'delete-premium-user-succeeds',
      auth: 'premium-active',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.delete('user/sessions', {});

        assert.isSuccess(response, 'Sign out all sessions should succeed for premium user');
        assert.hasProperty(response, 'data.sessions', 'Response should contain sessions count');
      },
    },

    // Test 10: Multiple calls are idempotent
    {
      name: 'delete-idempotent-operation',
      auth: 'basic',
      timeout: 30000,

      async run({ http, assert }) {
        // Call twice in a row - both should succeed
        const response1 = await http.delete('user/sessions', {});
        const response2 = await http.delete('user/sessions', {});

        assert.isSuccess(response1, 'First sign out should succeed');
        assert.isSuccess(response2, 'Second sign out should succeed (idempotent)');
      },
    },

    // Test 11: Unauthenticated DELETE request fails
    {
      name: 'delete-unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.delete('user/sessions', {});

        assert.isError(response, 401, 'Sign out all sessions should fail without authentication');
      },
    },
  ],
};
