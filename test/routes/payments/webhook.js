/**
 * Test: POST /payments/webhook
 * Tests the webhook endpoint validates requests and saves to Firestore
 */
const { TEST_ACCOUNTS } = require('../../../src/test/test-accounts.js');

module.exports = {
  description: 'Payment webhook endpoint',
  type: 'group',
  timeout: 30000,

  tests: [
    {
      name: 'rejects-missing-processor',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post('payments/webhook', {});

        assert.isError(response, 400, 'Should reject missing processor');
      },
    },

    {
      name: 'rejects-invalid-key',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post('payments/webhook?processor=stripe&key=wrong-key', {});

        assert.isError(response, 401, 'Should reject invalid key');
      },
    },

    {
      name: 'rejects-unknown-processor',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post(`payments/webhook?processor=unknown&key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: 'evt_test_unknown',
          type: 'test.event',
          data: { object: {} },
        });

        assert.isError(response, 400, 'Should reject unknown processor');
      },
    },

    {
      name: 'accepts-valid-stripe-webhook',
      auth: 'none',
      async run({ http, assert, firestore }) {
        const eventId = '_test-evt-valid-webhook';

        // Clean up any existing doc
        await firestore.delete(`payments-webhooks/${eventId}`);

        const response = await http.as('none').post(`payments/webhook?processor=stripe&key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: eventId,
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_test_valid',
              metadata: { uid: TEST_ACCOUNTS.basic.uid },
              status: 'active',
            },
          },
        });

        assert.isSuccess(response, 'Should accept valid webhook');
        assert.equal(response.data.received, true, 'Should confirm receipt');

        // Verify doc was saved to Firestore
        const doc = await firestore.get(`payments-webhooks/${eventId}`);
        assert.ok(doc, 'Webhook doc should exist in Firestore');
        assert.equal(doc.processor, 'stripe', 'Processor should be stripe');
        assert.ok(
          doc.status === 'pending' || doc.status === 'processing' || doc.status === 'completed',
          'Status should be pending, processing, or completed',
        );

        // Clean up
        await firestore.delete(`payments-webhooks/${eventId}`);
      },
    },

    {
      name: 'deduplicates-webhook-events',
      auth: 'none',
      async run({ http, assert, firestore }) {
        const eventId = '_test-evt-duplicate';

        // Clean up any existing doc
        await firestore.delete(`payments-webhooks/${eventId}`);

        // Send first webhook
        await http.as('none').post(`payments/webhook?processor=stripe&key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: eventId,
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_test_dup',
              metadata: { uid: TEST_ACCOUNTS.basic.uid },
              status: 'active',
            },
          },
        });

        // Send duplicate
        const response = await http.as('none').post(`payments/webhook?processor=stripe&key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: eventId,
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_test_dup',
              metadata: { uid: TEST_ACCOUNTS.basic.uid },
              status: 'active',
            },
          },
        });

        assert.isSuccess(response, 'Duplicate should still return 200');
        assert.equal(response.data.duplicate, true, 'Should indicate duplicate');

        // Clean up
        await firestore.delete(`payments-webhooks/${eventId}`);
      },
    },
  ],
};
