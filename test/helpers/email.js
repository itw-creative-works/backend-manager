/**
 * Test: Email library (libraries/email.js)
 * Library-level tests: validation edge cases, recipient formats, deduplication, features
 *
 * These tests exercise the email library through the admin/email route to get a real
 * SendGrid integration. Route-level tests (auth, permissions) are in test/routes/admin/email.js.
 */
module.exports = {
  description: 'Email library',
  type: 'group',
  skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE env var not set (skipping email tests)' : false,
  tests: [
    // --- Validation / Rejection ---

    {
      name: 'empty-to-array-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Empty To',
          to: [],
          copy: false,
        });

        assert.isError(response, 400, 'Empty to array should return 400');
      },
    },

    {
      name: 'object-recipient-without-email-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Bad Object',
          to: [{ name: 'No Email' }],
          copy: false,
        });

        assert.isError(response, 400, 'Object without email should return 400');
      },
    },

    {
      name: 'default-template-used-when-omitted',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Default Template',
          to: [{ email: `_test-receiver@${config.domain}` }],
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - Default Template',
              body: 'Testing that default template is used when not specified.',
            },
          },
        });

        assert.isSuccess(response, 'Should succeed with default template');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
        assert.equal(response.data.options.templateId, 'd-b7f8da3c98ad49a2ad1e187f3a67b546', 'Should use default template');
      },
    },

    {
      name: 'nonexistent-uid-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Bad UID',
          to: 'uid:nonexistent_uid_12345',
          copy: false,
        });

        assert.isError(response, 400, 'Nonexistent UID should return 400');
      },
    },

    // --- Subject Fallback ---

    {
      name: 'subject-from-data-fallback',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          to: [{ email: `_test-receiver@${config.domain}` }],
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - Fallback Subject',
              body: 'Testing subject fallback from data.email.subject.',
            },
          },
        });

        assert.isSuccess(response, 'Should use subject from data.email.subject');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
      },
    },

    // --- Recipient Formats ---

    {
      name: 'string-email-recipient',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - String Email',
          to: `_test-receiver@${config.domain}`,
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - String Email',
              body: 'Testing string email format.',
            },
          },
        });

        assert.isSuccess(response, 'Should send email to string address');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
      },
    },

    {
      name: 'uid-recipient',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, accounts }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - UID Recipient',
          to: `uid:${accounts.admin.uid}`,
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - UID Recipient',
              body: 'Testing UID resolution.',
            },
          },
        });

        assert.isSuccess(response, 'Should send email to UID');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
      },
    },

    {
      name: 'mixed-recipients',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, accounts, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Mixed Recipients',
          to: [
            `_test-receiver@${config.domain}`,
            { email: `_test-receiver-2@${config.domain}`, name: 'Receiver 2' },
            `uid:${accounts.admin.uid}`,
          ],
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - Mixed Recipients',
              body: 'Testing mixed recipient formats.',
            },
          },
        });

        assert.isSuccess(response, 'Should send email to mixed recipients');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
      },
    },

    {
      name: 'object-recipient-with-name',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Object Recipient',
          to: { email: `_test-receiver@${config.domain}`, name: 'Named Recipient' },
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - Object Recipient',
              body: 'Testing single object recipient with name.',
            },
          },
        });

        assert.isSuccess(response, 'Should send email to object recipient');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
      },
    },

    {
      name: 'cc-bcc-recipients-accepted',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - CC/BCC',
          to: `_test-receiver@${config.domain}`,
          cc: `_test-cc@${config.domain}`,
          bcc: { email: `_test-bcc@${config.domain}`, name: 'BCC Receiver' },
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - CC/BCC',
              body: 'Testing cc and bcc recipients.',
            },
          },
        });

        assert.isSuccess(response, 'Should send email with cc and bcc');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
      },
    },

    // --- Deduplication ---

    {
      name: 'dedup-same-email-in-to',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const email = `_test-dedup@${config.domain}`;

        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Dedup To',
          to: [email, email],
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - Dedup To',
              body: 'Testing deduplication of same email in to.',
            },
          },
        });

        assert.isSuccess(response, 'Should send despite duplicate to');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
        assert.equal(response.data.options.to.length, 1, 'Duplicate should be removed from to');
      },
    },

    {
      name: 'dedup-to-removes-from-cc',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const email = `_test-dedup-cc@${config.domain}`;

        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Dedup CC',
          to: email,
          cc: email,
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - Dedup CC',
              body: 'Testing cross-list dedup (to removes from cc).',
            },
          },
        });

        assert.isSuccess(response, 'Should send despite duplicate in cc');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
        assert.equal(response.data.options.cc.length, 0, 'Email in to should be removed from cc');
      },
    },

    {
      name: 'dedup-case-insensitive',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Case Dedup',
          to: [`_TEST-DEDUP@${config.domain}`, `_test-dedup@${config.domain}`],
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - Case Dedup',
              body: 'Testing case-insensitive deduplication.',
            },
          },
        });

        assert.isSuccess(response, 'Should send despite case-different duplicates');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
        assert.equal(response.data.options.to.length, 1, 'Case-insensitive duplicate should be removed');
      },
    },

    // --- Features ---

    {
      name: 'copy-false-no-carbon-copies',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - No Copy',
          to: `_test-receiver@${config.domain}`,
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - No Copy',
              body: 'Testing that copy:false produces no cc/bcc.',
            },
          },
        });

        assert.isSuccess(response, 'Should send email without carbon copies');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
        assert.equal(response.data.options.cc.length, 0, 'cc should be empty with copy:false');
        assert.equal(response.data.options.bcc.length, 0, 'bcc should be empty with copy:false');
      },
    },

    {
      name: 'html-override-replaces-template',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - HTML Override',
          to: `_test-receiver@${config.domain}`,
          html: '<p>This is raw HTML content.</p>',
          copy: false,
        });

        assert.isSuccess(response, 'Should send email with HTML override');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
        assert.ok(response.data.options.content, 'Should have content array for HTML override');
        assert.equal(response.data.options.templateId, undefined, 'templateId should be removed for HTML override');
      },
    },

    {
      name: 'svg-images-converted-to-png',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - SVG to PNG',
          to: `_test-receiver@${config.domain}`,
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - SVG to PNG',
              body: 'Testing that SVG images are converted to PNG for email.',
            },
          },
        });

        assert.isSuccess(response, 'Should send email');
        assert.equal(response.data.status, 'sent', 'Status should be sent');

        const appImages = response.data.options.dynamicTemplateData.app.images;

        // Any image that was an SVG should now be a PNG (-x.svg → -1024.png)
        for (const [key, value] of Object.entries(appImages)) {
          assert.ok(
            !String(value || '').endsWith('.svg'),
            `app.images.${key} should not be an SVG (got: ${value})`,
          );
        }
      },
    },

    // --- Sender Resolution ---

    {
      name: 'sender-orders-resolves-from-and-asm',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Sender Orders',
          to: `_test-receiver@${config.domain}`,
          sender: 'orders',
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - Sender Orders',
              body: 'Testing sender resolution for orders.',
            },
          },
        });

        assert.isSuccess(response, 'Should send email with orders sender');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
        assert.ok(response.data.options.from.email.startsWith('orders@'), 'From email should start with orders@');
        assert.ok(response.data.options.from.name.includes('Orders'), 'From name should include Orders');
        assert.ok(response.data.options.asm, 'Should have ASM group');
        assert.ok(response.data.options.replyTo.startsWith('orders@'), 'replyTo should match from address');
      },
    },

    {
      name: 'sender-security-resolves-from-asm-and-unsubscribe',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Sender Security',
          to: `_test-receiver@${config.domain}`,
          sender: 'security',
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - Sender Security',
              body: 'Testing that security sender resolves correctly.',
            },
          },
        });

        assert.isSuccess(response, 'Should send email with security sender');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
        assert.ok(response.data.options.from.email.startsWith('security@'), 'From email should start with security@');
        assert.ok(response.data.options.asm, 'Should have ASM group');
        assert.ok(response.data.options.headers['List-Unsubscribe'], 'Should have List-Unsubscribe header');
        assert.ok(response.data.options.dynamicTemplateData.email.unsubscribeUrl, 'Should have unsubscribeUrl');
      },
    },

    {
      name: 'sender-explicit-from-overrides-sender',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const customFrom = { email: `custom@${config.domain}`, name: 'Custom Sender' };

        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - From Override',
          to: `_test-receiver@${config.domain}`,
          sender: 'orders',
          from: customFrom,
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - From Override',
              body: 'Testing that explicit from overrides sender.',
            },
          },
        });

        assert.isSuccess(response, 'Should send email with explicit from');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
        assert.equal(response.data.options.from.email, customFrom.email, 'Explicit from should override sender');
        assert.equal(response.data.options.from.name, customFrom.name, 'Explicit from name should override sender');
      },
    },

    {
      name: 'sender-unknown-falls-back-to-defaults',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - Unknown Sender',
          to: `_test-receiver@${config.domain}`,
          sender: 'nonexistent',
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - Unknown Sender',
              body: 'Testing that unknown sender falls back to brand defaults.',
            },
          },
        });

        assert.isSuccess(response, 'Should send email with default from');
        assert.equal(response.data.status, 'sent', 'Status should be sent');
        assert.ok(response.data.options.from.email, 'Should have a from email (brand default)');
        assert.ok(response.data.options.asm, 'Should have default ASM group');
      },
    },

    {
      name: 'sendat-iso-string-accepted',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, config }) {
        // Use a time 1 hour from now (well within the 71h limit)
        const sendAtDate = new Date(Date.now() + (60 * 60 * 1000)).toISOString();

        const response = await http.post('admin/email', {
          subject: 'BEM Test Email - ISO SendAt',
          to: `_test-receiver@${config.domain}`,
          sendAt: sendAtDate,
          copy: false,
          data: {
            email: {
              subject: 'BEM Test Email - ISO SendAt',
              body: 'Testing ISO string sendAt.',
            },
          },
        });

        assert.isSuccess(response, 'Should send email with ISO sendAt');
        assert.equal(response.data.status, 'sent', 'Status should be sent (within 71h)');
        assert.isType(response.data.options.sendAt, 'number', 'sendAt should be normalized to unix timestamp');
      },
    },
  ],
};
