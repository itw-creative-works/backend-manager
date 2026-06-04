/**
 * Test: POST /marketing/campaign — Send a marketing campaign (Single Send)
 *
 * Normal mode: creates campaign doc in Firestore, verifies structure
 * Extended mode (TEST_EXTENDED_MODE=true): sends a real test campaign via SendGrid/Beehiiv
 *   targeting the test_admin segment (hello@itwcreativeworks.com only)
 */

module.exports = {
  description: 'Marketing campaign (POST create + send)',
  type: 'group',
  tests: [
    {
      name: 'send-test-campaign',
      auth: 'admin',
      timeout: 60000,
      skip: !process.env.TEST_EXTENDED_MODE
        ? 'TEST_EXTENDED_MODE not set (real provider send)'
        : false,

      async run({ http, assert, state }) {
        const response = await http.post('marketing/campaign', {
          name: 'BEM Test Campaign',
          subject: 'Test Marketing Email',
          content: '# Hello\n\nThis is a **test marketing email** sent from the BEM test suite.\n\nIf you received this, the SendGrid Single Send pipeline is working.',
          test: true,
          sendAt: 'now',
        });

        assert.isSuccess(response, 'Campaign creation should succeed');
        assert.hasProperty(response, 'data.id', 'Response should contain campaign ID');
        assert.hasProperty(response, 'data.providers', 'Response should contain provider results');

        const providers = response.data.providers || {};

        console.log('Campaign results:', JSON.stringify(providers, null, 2));

        if (providers.sendgrid) {
          state.sendgridId = providers.sendgrid.id;

          assert.propertyEquals(
            response, 'data.providers.sendgrid.success', true,
            `SendGrid should succeed. Error: ${providers.sendgrid.error || 'none'}`,
          );
        }

        if (providers.beehiiv) {
          assert.hasProperty(response, 'data.providers.beehiiv', 'Should have Beehiiv result');
        }

        state.campaignId = response.data.id;
      },

      async cleanup({ state }) {
        if (state.campaignId) {
          console.log(`Campaign ID: ${state.campaignId}`);
        }
        if (state.sendgridId) {
          console.log(`SendGrid Single Send ID: ${state.sendgridId}`);
        }
      },
    },

    {
      name: 'create-future-campaign-is-pending',
      auth: 'admin',
      timeout: 30000,

      async run({ http, assert, firestore }) {
        // Future sendAt → campaign is saved as 'pending' for cron pickup, not sent immediately
        const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const response = await http.post('marketing/campaign', {
          name: 'Future Campaign',
          subject: 'Future Subject',
          content: 'Future content',
          test: true,
          sendAt: futureDate,
        });

        assert.isSuccess(response, 'Future campaign creation should succeed');
        assert.hasProperty(response, 'data.id', 'Response should contain campaign ID');
        assert.propertyEquals(response, 'data.status', 'pending', 'Future campaign should be pending');

        const doc = await firestore.get(`marketing-campaigns/${response.data.id}`);
        assert.ok(doc, 'Campaign doc should exist in Firestore');
        assert.equal(doc.status, 'pending', 'Firestore doc status should be pending');
        assert.equal(doc.settings.name, 'Future Campaign', 'Name should match input');
        assert.propertyEquals(response, 'data.providers', null, 'Future campaign should not have provider results');
      },
    },

    {
      name: 'campaign-requires-admin',
      auth: 'user',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('marketing/campaign', {
          name: 'Unauthorized Campaign',
          subject: 'Should fail',
          content: 'Should fail',
        });

        assert.isError(response, 403, 'Non-admin should get 403');
      },
    },

    {
      name: 'campaign-requires-auth',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const response = await http.post('marketing/campaign', {
          name: 'Unauthenticated Campaign',
          subject: 'Should fail',
          content: 'Should fail',
        });

        assert.isError(response, 401, 'Unauthenticated should get 401');
      },
    },
  ],
};
