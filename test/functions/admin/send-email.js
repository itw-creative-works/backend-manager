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
 * - 'non-unique': Duplicate email detected (when ensureUnique: true)
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
          ensureUnique: false,
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
          ensureUnique: false,
          data: {
            email: {
              subject: 'BEM Test Email - Status Sent',
              body: 'This is a test email from BEM tests (status: sent).',
            },
          },
        });

        assert.isSuccess(response, 'Admin should be able to send email');
        assert.hasProperty(response, 'data.status', 'Response should have status');
        assert.equal(response.data.status, 'sent', 'Status should be sent when ensureUnique is false');
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
          ensureUnique: false,
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

    // Test 6: Status 'non-unique' - Duplicate email detected
    // This test sends two identical emails with ensureUnique: true
    // The second one should return 'non-unique' status
    {
      name: 'status-non-unique',
      auth: 'admin',
      timeout: 120000, // Long timeout because ensureUnique waits ~45 seconds

      async run({ http, assert, config }) {
        const uniqueSubject = `BEM Test Email - Unique Check ${Date.now()}`;

        // Send first email with ensureUnique: true
        const response1Promise = http.command('admin:send-email', {
          subject: uniqueSubject,
          to: [{ email: `_test-receiver@${config.domain}` }],
          copy: false,
          ensureUnique: true,
          categories: ['bem-test-unique'],
          data: {
            email: {
              subject: uniqueSubject,
              body: 'Testing ensureUnique feature.',
            },
          },
        });

        // Send second identical email immediately (same subject, to, categories = same hash)
        const response2Promise = http.command('admin:send-email', {
          subject: uniqueSubject,
          to: [{ email: `_test-receiver@${config.domain}` }],
          copy: false,
          ensureUnique: true,
          categories: ['bem-test-unique'],
          data: {
            email: {
              subject: uniqueSubject,
              body: 'Testing ensureUnique feature.',
            },
          },
        });

        // Wait for both
        const [response1, response2] = await Promise.all([response1Promise, response2Promise]);

        // Both should succeed
        assert.isSuccess(response1, 'First email should succeed');
        assert.isSuccess(response2, 'Second email should succeed');

        // One should be 'sent', the other 'non-unique'
        const statuses = [response1.data.status, response2.data.status].sort();
        assert.equal(statuses[0], 'non-unique', 'One email should have status non-unique');
        assert.equal(statuses[1], 'sent', 'One email should have status sent');
      },
    },

    // Test 7: Unauthorized sender domain rejected by SendGrid
    // TODO: SendGrid accepts emails from unauthorized domains at API level
    // (they may fail at delivery). Consider adding BEM-level validation.
    // {
    //   name: 'unauthorized-from-domain-rejected',
    //   auth: 'admin',
    //   timeout: 30000,
    //
    //   async run({ http, assert, config }) {
    //     const response = await http.command('admin:send-email', {
    //       subject: 'BEM Test Email - Unauthorized Sender',
    //       to: [{ email: `_test-receiver@${config.domain}` }],
    //       from: { email: 'fake-sender@example.com', name: 'Fake Sender' },
    //       copy: false,
    //       ensureUnique: false,
    //       data: {
    //         email: {
    //           subject: 'BEM Test Email - Unauthorized Sender',
    //           body: 'This email should fail because the sender domain is not authorized.',
    //         },
    //       },
    //     });
    //
    //     // SendGrid rejects emails from unauthorized sender domains with 403
    //     assert.isError(response, 500, 'Sending from unauthorized domain should fail');
    //   },
    // },

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

        assert.isError(response, 401, 'Send email should fail for non-admin user');
      },
    },
  ],
};
