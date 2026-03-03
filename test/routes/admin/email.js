/**
 * Test: POST /admin/email
 * Route-level tests: auth, permissions, HTTP status codes, basic send/queue
 *
 * Library-level tests (validation, dedup, recipients, features) are in test/helpers/email.js
 */
module.exports = {
  description: 'Admin send email (route)',
  type: 'group',
  skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE env var not set (skipping email tests)' : false,
  tests: [
    // --- Auth / Permissions ---

    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'Test Email',
          to: [{ email: `_test-receiver@${config.domain}` }],
        });

        assert.isError(response, 401, 'Send email should fail without authentication');
      },
    },

    {
      name: 'non-admin-rejected',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'Test Email',
          to: [{ email: `_test-receiver@${config.domain}` }],
        });

        assert.isError(response, 403, 'Send email should fail for non-admin user');
      },
    },

    // --- Basic Validation ---

    {
      name: 'missing-subject-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          to: [{ email: `_test-receiver@${config.domain}` }],
          copy: false,
        });

        assert.isError(response, 400, 'Missing subject should return 400');
      },
    },

    // --- Happy Path ---

    {
      name: 'status-sent',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Status Sent',
          to: [{ email: `_test-receiver@${config.domain}`, name: 'Test Receiver' }],
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - Status Sent',
              body: 'This is a test email from BEM tests (status: sent).',
            },
          },
        });

        assert.isSuccess(response, 'Admin should be able to send email');
        assert.hasProperty(response, 'data.status', 'Response should have status');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
      },
    },

    {
      name: 'status-queued',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const sendAt = Math.floor(Date.now() / 1000) + (72 * 60 * 60);

        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Status Queued',
          to: [{ email: `_test-receiver@${config.domain}`, name: 'Test Receiver' }],
          copy: false,
          sendAt: sendAt,
          data: {
            email: {
              subject: 'BEM Test Email - Status Queued',
              body: 'This is a test email scheduled for later (status: queued).',
            },
          },
        });

        assert.isSuccess(response, 'Admin should be able to queue email');
        assert.hasProperty(response, 'data.status', 'Response should have status');
        assert.equal(response.data.status, 'queued', 'Status should be queued when sendAt is beyond 71 hours');
      },
    },
  ],
};
