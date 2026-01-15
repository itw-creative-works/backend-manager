/**
 * Test: GET /admin/stats
 * Tests the admin get stats endpoint
 * Requires admin authentication
 */
module.exports = {
  description: 'Admin get stats operation',
  type: 'group',
  tests: [
    // Test 1: Admin can get stats
    {
      name: 'admin-get-stats-succeeds',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.get('admin/stats', {});

        assert.isSuccess(response, 'Get stats should succeed with admin auth');
        assert.ok(
          typeof response.data === 'object',
          'Response data should be an object'
        );
      },
    },

    // Test 2: Stats contains users field
    {
      name: 'stats-contains-users',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.get('admin/stats', {});

        assert.isSuccess(response, 'Get stats should succeed');
        assert.hasProperty(response, 'data.users', 'Stats should contain users field');
        assert.hasProperty(response, 'data.users.total', 'Users should have total field');
        assert.ok(
          typeof response.data.users.total === 'number',
          'users.total should be a number'
        );
      },
    },

    // Test 3: Stats with update flag refreshes data
    {
      name: 'stats-with-update',
      auth: 'admin',
      timeout: 60000,

      async run({ http, assert }) {
        const response = await http.get('admin/stats', {
          update: { users: true },
        });

        assert.isSuccess(response, 'Get stats with update should succeed');
        assert.hasProperty(response, 'data.users.total', 'Updated stats should have users.total');
        assert.ok(
          response.data.users.total >= 0,
          'users.total should be a non-negative number'
        );
      },
    },

    // Test 4: Stats contains metadata
    {
      name: 'stats-has-metadata',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        await http.get('admin/stats', {
          update: { users: true },
        });

        const response = await http.get('admin/stats', {});

        assert.isSuccess(response, 'Get stats should succeed');
        if (response.data.metadata) {
          assert.hasProperty(response, 'data.metadata.updated', 'Metadata should have updated timestamp');
        }
      },
    },

    // Test 5: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('admin/stats', {});

        assert.isError(response, 401, 'Get stats should fail without authentication');
      },
    },

    // Test 6: Non-admin user fails
    {
      name: 'non-admin-rejected',
      auth: 'user',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.get('admin/stats', {});

        assert.isError(response, 403, 'Get stats should fail for non-admin user');
      },
    },
  ],
};
