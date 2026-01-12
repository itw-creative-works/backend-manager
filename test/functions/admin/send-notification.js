const { TEST_DATA } = require('../../../src/test/test-accounts.js');

/**
 * Test: admin:send-notification
 * Tests the admin send notification (FCM) command
 * Requires admin authentication
 *
 * To test with a real FCM token, set the TEST_FCM_TOKEN environment variable:
 *   TEST_FCM_TOKEN=your-fcm-token npx bm test admin/send-notification
 *
 * You can get your FCM token from browser dev tools (Application > Service Workers)
 * or from console.log in your app's notification subscription code.
 */
module.exports = {
  description: 'Admin send notification (FCM)',
  type: 'group',
  tests: [
    // Test 1: Admin can call send-notification with no subscribers
    // (In emulator, notifications collection is likely empty)
    {
      name: 'admin-succeeds-empty-collection',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.command('admin:send-notification', {
          notification: {
            title: 'BEM Test Notification',
            body: 'Testing from BEM test suite',
            clickAction: 'https://example.com/test',
          },
        });

        assert.isSuccess(response, 'Send notification should succeed for admin');
        assert.hasProperty(response, 'data.sent', 'Response should have sent count');
        assert.hasProperty(response, 'data.deleted', 'Response should have deleted count');
      },
    },

    // Test 4: Notification with owner filter
    {
      name: 'with-owner-filter',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.command('admin:send-notification', {
          notification: {
            title: 'Filtered Notification',
            body: 'Testing owner filter',
          },
          filters: {
            owner: TEST_DATA.filterUid,
            limit: 10,
          },
        });

        assert.isSuccess(response, 'Send notification with filters should succeed');
        assert.hasProperty(response, 'data.sent', 'Response should have sent count');
      },
    },

    // Test 5: Notification with tags filter
    {
      name: 'with-tags-filter',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.command('admin:send-notification', {
          notification: {
            title: 'Tagged Notification',
            body: 'Testing tags filter',
          },
          filters: {
            tags: ['test-tag', 'another-tag'],
          },
        });

        assert.isSuccess(response, 'Send notification with tags filter should succeed');
      },
    },

    // Test 6: Notification with limit filter
    {
      name: 'with-limit-filter',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.command('admin:send-notification', {
          notification: {
            title: 'Limited Notification',
            body: 'Testing limit filter',
          },
          filters: {
            limit: 5,
          },
        });

        assert.isSuccess(response, 'Send notification with limit should succeed');
        assert.hasProperty(response, 'data.sent', 'Response should have sent count');
      },
    },

    // Test 7: Default notification values applied
    {
      name: 'default-values-applied',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        // Send with minimal payload to test defaults
        const response = await http.command('admin:send-notification', {
          notification: {},
          filters: {
            limit: 1,
          },
        });

        assert.isSuccess(response, 'Send notification with defaults should succeed');
      },
    },

    // Test 8: Send to real FCM token (requires TEST_FCM_TOKEN env var)
    // Skip if no token configured
    {
      name: 'send-to-real-token',
      auth: 'admin',
      timeout: 30000,
      skip: !process.env.TEST_FCM_TOKEN ? 'TEST_FCM_TOKEN env var not set' : false,

      async run({ http, assert, config }) {
        const response = await http.command('admin:send-notification', {
          notification: {
            title: 'BEM Test Notification',
            body: `Test sent at ${new Date().toISOString()}`,
            clickAction: `https://${config.domain}/?test-notification=true`,
          },
          filters: {
            token: process.env.TEST_FCM_TOKEN,
          },
        });

        assert.isSuccess(response, 'Send notification to real token should succeed');
        assert.hasProperty(response, 'data.sent', 'Response should have sent count');
      },
    },

    // Test 9: Send to fake token (API succeeds, FCM fails silently)
    {
      name: 'fake-token-api-succeeds',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.command('admin:send-notification', {
          notification: {
            title: 'Fake Token Test',
            body: 'Testing with invalid token',
          },
          filters: {
            token: 'fake-invalid-token-for-testing',
          },
        });

        // The API should succeed even if FCM fails
        // (FCM errors are logged but don't fail the request)
        assert.isSuccess(response, 'Send notification to fake token should succeed API-wise');
      },
    },

    // --- Auth rejection tests (at end per convention) ---
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('admin:send-notification', {
          notification: {
            title: 'Test Notification',
            body: 'This is a test',
          },
        });

        assert.isError(response, 401, 'Send notification should fail without authentication');
      },
    },

    {
      name: 'non-admin-rejected',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.command('admin:send-notification', {
          notification: {
            title: 'Test Notification',
            body: 'This is a test',
          },
        });

        assert.isError(response, 401, 'Send notification should fail for non-admin user');
      },
    },
  ],
};
