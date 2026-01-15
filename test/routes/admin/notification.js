/**
 * Test: POST /admin/notification
 * Tests the admin send notification (FCM) endpoint
 * Requires admin authentication
 */
const { TEST_DATA } = require('../../../src/test/test-accounts.js');

module.exports = {
  description: 'Admin send notification (FCM)',
  type: 'group',
  tests: [
    // Test 1: Admin can call send-notification with no subscribers
    {
      name: 'admin-succeeds-empty-collection',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.post('admin/notification', {
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

    // Test 2: Notification with owner filter
    {
      name: 'with-owner-filter',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.post('admin/notification', {
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

    // Test 3: Notification with tags filter
    {
      name: 'with-tags-filter',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.post('admin/notification', {
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

    // Test 4: Notification with limit filter
    {
      name: 'with-limit-filter',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.post('admin/notification', {
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

    // Test 5: Default notification values applied when notification is omitted
    {
      name: 'default-values-applied',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        // Omit notification entirely to test schema defaults are applied
        const response = await http.post('admin/notification', {
          filters: {
            limit: 1,
          },
        });

        assert.isSuccess(response, 'Send notification with defaults should succeed');
      },
    },

    // Test 6: Send to real FCM token (requires TEST_FCM_TOKEN env var)
    {
      name: 'send-to-real-token',
      auth: 'admin',
      timeout: 30000,
      skip: !process.env.TEST_FCM_TOKEN ? 'TEST_FCM_TOKEN env var not set' : false,

      async run({ http, assert, config }) {
        const response = await http.post('admin/notification', {
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

    // Test 7: Send to fake token (API succeeds, FCM fails silently)
    {
      name: 'fake-token-api-succeeds',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert }) {
        const response = await http.post('admin/notification', {
          notification: {
            title: 'Fake Token Test',
            body: 'Testing with invalid token',
          },
          filters: {
            token: 'fake-invalid-token-for-testing',
          },
        });

        assert.isSuccess(response, 'Send notification to fake token should succeed API-wise');
      },
    },

    // Test 8: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/notification', {
          notification: {
            title: 'Test Notification',
            body: 'This is a test',
          },
        });

        assert.isError(response, 401, 'Send notification should fail without authentication');
      },
    },

    // Test 9: Non-admin user fails
    {
      name: 'non-admin-rejected',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/notification', {
          notification: {
            title: 'Test Notification',
            body: 'This is a test',
          },
        });

        assert.isError(response, 403, 'Send notification should fail for non-admin user');
      },
    },
  ],
};
