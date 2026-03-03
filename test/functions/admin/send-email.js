/**
 * Test: admin:send-email
 * Tests the admin send email command
 * Requires admin authentication and SendGrid API key configured
 *
 * To test with SendGrid, set SENDGRID_API_KEY environment variable.
 * Tests will be skipped if SendGrid is not configured.
 *
 * Possible status values:
 * - 'sent': Email sent via SendGrid
 * - 'queued': Scheduled beyond 71 hours, saved to queue for later
 */
module.exports = {
  description: 'Admin send email',
  type: 'group',
  skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE env var not set (skipping email tests)' : false,
  tests: [
    // Test 1: Missing subject returns 400 error
    {
      name: 'missing-subject-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert, config }) {
        const response = await http.command('admin:send-email', {
          to: [{ email: `_test-receiver@${config.domain}` }],
          copy: false,
        });

        assert.isError(response, 400, 'Missing subject should return 400');
      },
    },

    // Test 4: Status 'sent' - Email sent successfully via SendGrid
    {
      name: 'status-sent',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.command('admin:send-email', {
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

    // Test 5: Status 'queued' - Email scheduled beyond 71 hours
    {
      name: 'status-queued',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        // Schedule email for 72+ hours from now (beyond SendGrid's 71-hour limit)
        const sendAt = Math.floor(Date.now() / 1000) + (72 * 60 * 60);

        const response = await http.command('admin:send-email', {
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

    // --- Auth rejection tests (at end per convention) ---
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert, config }) {
        const response = await http.command('admin:send-email', {
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
        const response = await http.command('admin:send-email', {
          subject: 'Test Email',
          to: [{ email: `_test-receiver@${config.domain}` }],
        });

        assert.isError(response, 403, 'Send email should fail for non-admin user');
      },
    },
  ],
};
