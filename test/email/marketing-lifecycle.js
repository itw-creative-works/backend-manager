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
        await http.delete('backend-manager/marketing/contact', { email: testEmail }).catch(() => {});
      },
    },

    // Step 1: Add a contact via POST /marketing/contact
    {
      name: 'add-contact',
      auth: 'admin',

      async run({ http, assert, state, config }) {
        const response = await http.post('backend-manager/marketing/contact', {
          email: state.testEmail,
          firstName: 'Lifecycle',
          lastName: 'Test',
          source: 'bem-test-lifecycle',
        });

        assert.isSuccess(response, 'Add contact should succeed');
        assert.propertyEquals(response, 'data.success', true, 'success should be true');

        if (process.env.SENDGRID_API_KEY) {
          assert.hasProperty(response, 'data.providers.campaigns', 'Should have SendGrid result');
          assert.propertyEquals(response, 'data.providers.campaigns.success', true, 'SendGrid add should succeed');
        }

        if (process.env.BEEHIIV_API_KEY && config.marketing?.newsletter?.publicationId) {
          assert.hasProperty(response, 'data.providers.newsletter', 'Should have Beehiiv result');
          assert.propertyEquals(response, 'data.providers.newsletter.success', true, 'Beehiiv add should succeed');
        }
      },
    },

    // Step 2: Sync by UID via PUT /marketing/contact
    // Tests the full sync pipeline: UID resolution → buildFields → upsert with custom fields
    {
      name: 'sync-contact-by-uid',
      auth: 'admin',

      async run({ http, assert, accounts, config, Manager }) {
        // Dedicated journey account — its _test.allow_* prefix bypasses validation, and the
        // cleanup step's DELETE revokes its doc consent, so it must not be a shared sentinel
        // (consent-granted is used by the signup + consent-lifecycle suites).
        const grantedUid = accounts['journey-marketing-sync'].uid;
        const admin = Manager.libraries.admin;
        await admin.firestore().doc(`users/${grantedUid}`).set({
          consent: { marketing: { status: 'granted' } },
        }, { merge: true });

        const response = await http.put('backend-manager/marketing/contact', {
          uid: grantedUid,
        });

        assert.isSuccess(response, 'Sync contact should succeed');
        assert.propertyEquals(response, 'data.success', true, 'success should be true');

        if (process.env.SENDGRID_API_KEY) {
          assert.hasProperty(response, 'data.providers.campaigns', 'Should have SendGrid result');
          assert.propertyEquals(response, 'data.providers.campaigns.success', true, 'SendGrid sync should succeed');
        }

        if (process.env.BEEHIIV_API_KEY && config.marketing?.newsletter?.publicationId) {
          assert.hasProperty(response, 'data.providers.newsletter', 'Should have Beehiiv result');
          assert.propertyEquals(response, 'data.providers.newsletter.success', true, 'Beehiiv sync should succeed');
        }
      },
    },

    // Step 3: Remove the contact via DELETE /marketing/contact
    {
      name: 'remove-contact',
      auth: 'admin',

      async run({ http, assert, state, config }) {
        const response = await http.delete('backend-manager/marketing/contact', {
          email: state.testEmail,
        });

        assert.isSuccess(response, 'Remove contact should succeed');
        assert.propertyEquals(response, 'data.success', true, 'success should be true');

        if (process.env.SENDGRID_API_KEY) {
          assert.hasProperty(response, 'data.providers.campaigns', 'Should have SendGrid result');
          assert.propertyEquals(response, 'data.providers.campaigns.success', true, 'SendGrid remove should succeed');
        }

        if (process.env.BEEHIIV_API_KEY && config.marketing?.newsletter?.publicationId) {
          assert.hasProperty(response, 'data.providers.newsletter', 'Should have Beehiiv result');
          assert.propertyEquals(response, 'data.providers.newsletter.success', true, 'Beehiiv remove should succeed');
        }
      },
    },

    // Step 4: Clean up the contact the sync step added to the live providers.
    // DELETE also mirrors revoked consent to the matching user doc — which is why this
    // targets the dedicated journey account (step 2 re-seeds granted before syncing, so
    // the suite is self-healing across runs).
    {
      name: 'cleanup-synced-contact',
      auth: 'admin',

      async run({ http, accounts }) {
        await http.delete('backend-manager/marketing/contact', {
          email: accounts['journey-marketing-sync'].email,
        }).catch(() => {});
      },
    },
  ],
};
