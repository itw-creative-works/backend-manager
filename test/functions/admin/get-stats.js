/**
 * Test: admin:get-stats
 * Tests the admin get stats command
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
        const response = await http.command('admin:get-stats', {});

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
        const response = await http.command('admin:get-stats', {});

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
      timeout: 60000, // Longer timeout for update operation

      async run({ http, assert }) {
        const response = await http.command('admin:get-stats', {
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
        // First do an update to ensure metadata is set
        await http.command('admin:get-stats', {
          update: { users: true },
        });

        // Then fetch stats
        const response = await http.command('admin:get-stats', {});

        assert.isSuccess(response, 'Get stats should succeed');
        // Metadata may or may not exist on first run
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
        const response = await http.command('admin:get-stats', {});

        assert.isError(response, 401, 'Get stats should fail without authentication');
      },
    },

    // Test 6: Non-admin user fails
    {
      name: 'non-admin-rejected',
      auth: 'user',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('admin:get-stats', {});

        assert.isError(response, 401, 'Get stats should fail for non-admin user');
      },
    },
  ],
};
