/**
 * Test: Marketing lifecycle (add → sync → remove)
 * End-to-end suite testing the full marketing contact flow via routes
 *
 * Requires TEST_EXTENDED_MODE=true and SENDGRID_API_KEY / BEEHIIV_API_KEY env vars.
 * These tests hit real external APIs.
 */
module.exports = {
  description: 'Marketing lifecycle (add → sync → remove)',
  type: 'suite',
  timeout: 60000,
  skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE not set' : false,

  tests: [
    // Step 0: Pre-clean test contacts from providers (in case a previous run left them)
    {
      name: 'pre-clean-test-contacts',
      auth: 'admin',

      async run({ http, config, state }) {
        const testEmail = `lifecycle.test+bem@${config.domain}`;
        state.testEmail = testEmail;

        // Delete from all providers — handles "not found" gracefully
        await http.delete('marketing/contact', { email: testEmail }).catch(() => {});
      },
    },

    // Step 1: Add a contact via POST /marketing/contact
    {
      name: 'add-contact',
      auth: 'admin',

      async run({ http, assert, state }) {
        const response = await http.post('marketing/contact', {
          email: state.testEmail,
          firstName: 'Lifecycle',
          lastName: 'Test',
          source: 'bem-test-lifecycle',
        });

        assert.isSuccess(response, 'Add contact should succeed');
        assert.propertyEquals(response, 'data.success', true, 'success should be true');

        if (process.env.SENDGRID_API_KEY) {
          assert.hasProperty(response, 'data.providers.sendgrid', 'Should have SendGrid result');
          assert.propertyEquals(response, 'data.providers.sendgrid.success', true, 'SendGrid add should succeed');
        }

        if (process.env.BEEHIIV_API_KEY) {
          assert.hasProperty(response, 'data.providers.beehiiv', 'Should have Beehiiv result');
          assert.propertyEquals(response, 'data.providers.beehiiv.success', true, 'Beehiiv add should succeed');
        }
      },
    },

    // Step 2: Sync by UID via PUT /marketing/contact
    // Tests the full sync pipeline: UID resolution → buildFields → upsert with custom fields
    {
      name: 'sync-contact-by-uid',
      auth: 'admin',

      async run({ http, assert, accounts }) {
        // Sync the admin test account — exercises UID→doc resolution + buildFields
        const response = await http.put('marketing/contact', {
          uid: accounts.admin.uid,
        });

        assert.isSuccess(response, 'Sync contact should succeed');
        assert.propertyEquals(response, 'data.success', true, 'success should be true');

        if (process.env.SENDGRID_API_KEY) {
          assert.hasProperty(response, 'data.providers.sendgrid', 'Should have SendGrid result');
          assert.propertyEquals(response, 'data.providers.sendgrid.success', true, 'SendGrid sync should succeed');
        }

        if (process.env.BEEHIIV_API_KEY) {
          assert.hasProperty(response, 'data.providers.beehiiv', 'Should have Beehiiv result');
          assert.propertyEquals(response, 'data.providers.beehiiv.success', true, 'Beehiiv sync should succeed');
        }
      },
    },

    // Step 3: Remove the contact via DELETE /marketing/contact
    {
      name: 'remove-contact',
      auth: 'admin',

      async run({ http, assert, state }) {
        const response = await http.delete('marketing/contact', {
          email: state.testEmail,
        });

        assert.isSuccess(response, 'Remove contact should succeed');
        assert.propertyEquals(response, 'data.success', true, 'success should be true');

        if (process.env.SENDGRID_API_KEY) {
          assert.hasProperty(response, 'data.providers.sendgrid', 'Should have SendGrid result');
          assert.propertyEquals(response, 'data.providers.sendgrid.success', true, 'SendGrid remove should succeed');
        }

        if (process.env.BEEHIIV_API_KEY) {
          assert.hasProperty(response, 'data.providers.beehiiv', 'Should have Beehiiv result');
          assert.propertyEquals(response, 'data.providers.beehiiv.success', true, 'Beehiiv remove should succeed');
        }
      },
    },

    // Step 4: Clean up the admin test contact that sync added
    {
      name: 'cleanup-synced-admin-contact',
      auth: 'admin',

      async run({ http, accounts }) {
        await http.delete('marketing/contact', {
          email: accounts.admin.email,
        }).catch(() => {});
      },
    },
  ],
};
