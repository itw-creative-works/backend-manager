/**
 * Test: POST /admin/email
 * Tests the admin send email endpoint
 * Requires admin authentication and SendGrid API key configured
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
        const response = await http.post('admin/email', {
          to: [{ email: `_test-receiver@${config.domain}` }],
          copy: false,
          ensureUnique: false,
        });

        assert.isError(response, 400, 'Missing subject should return 400');
      },
    },

    // Test 2: Status 'sent' - Email sent successfully via SendGrid
    {
      name: 'status-sent',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
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

    // Test 3: Status 'queued' - Email scheduled beyond 71 hours
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

    // Test 4: Status 'non-unique' - Duplicate email detected
    {
      name: 'status-non-unique',
      auth: 'admin',
      timeout: 120000,

      async run({ http, assert, config }) {
        const uniqueSubject = `BEM Test Email - Unique Check ${Date.now()}`;

        const response1Promise = http.post('admin/email', {
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

        const response2Promise = http.post('admin/email', {
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

        const [response1, response2] = await Promise.all([response1Promise, response2Promise]);

        assert.isSuccess(response1, 'First email should succeed');
        assert.isSuccess(response2, 'Second email should succeed');

        const statuses = [response1.data.status, response2.data.status].sort();
        assert.equal(statuses[0], 'non-unique', 'One email should have status non-unique');
        assert.equal(statuses[1], 'sent', 'One email should have status sent');
      },
    },

    // Test 5: Unauthenticated request fails
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

    // Test 6: Non-admin user fails
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
  ],
};
