/**
 * Test: POST /user/settings/validate
 * Tests the user validate settings endpoint
 * Requires authentication and validates settings against schema
 *
 * SKIPPED: Requires project-specific defaults.js file which BEM test environment doesn't have
 */
module.exports = {
  description: 'User validate settings',
  skip: 'Requires project-specific defaults.js file',
  type: 'group',
  tests: [
    // Test 1: Authenticated user can validate settings
    {
      name: 'authenticated-user-succeeds',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('user/settings/validate', {
          existingSettings: {},
          newSettings: {},
        });

        assert.isSuccess(response, 'Validate settings should succeed for authenticated user');
      },
    },

    // Test 2: With existing settings
    {
      name: 'with-existing-settings',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('user/settings/validate', {
          existingSettings: {
            theme: 'dark',
            notifications: true,
          },
          newSettings: {
            theme: 'light',
          },
        });

        assert.isSuccess(response, 'Validate settings with data should succeed');
      },
    },

    // Test 3: Premium user can validate settings
    {
      name: 'premium-user-succeeds',
      auth: 'premium-active',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('user/settings/validate', {
          existingSettings: {},
          newSettings: {},
        });

        assert.isSuccess(response, 'Validate settings should succeed for premium user');
      },
    },

    // Test 4: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('user/settings/validate', {
          existingSettings: {},
          newSettings: {},
        });

        assert.isError(response, 401, 'Validate settings should fail without authentication');
      },
    },
  ],
};
