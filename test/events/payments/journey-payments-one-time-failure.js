/**
 * Test: Payment Journey - One-Time Payment Failure
 * Simulates: invoice.payment_failed for a non-subscription invoice → purchase-failed transition
 *
 * This verifies the webhook routing for one-time invoice failures:
 * invoice.payment_failed with no subscription billing_reason → category: 'one-time'
 *
 * Uses the journey-payments-one-time account (one-time events don't modify subscription state)
 */
module.exports = {
  description: 'Payment journey: one-time invoice.payment_failed → purchase-failed',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'resolve-one-time-product',
      async run({ accounts, assert, state, config }) {
        const uid = accounts['journey-payments-one-time'].uid;

        // Resolve first one-time product from config
        const oneTimeProduct = config.payment.products.find(p => p.type === 'one-time' && p.prices?.once);
        assert.ok(oneTimeProduct, 'Config should have at least one one-time product');

        state.uid = uid;
        state.productId = oneTimeProduct.id;
      },
    },

    {
      name: 'send-one-time-payment-failed',
      async run({ http, assert, state, config }) {
        state.eventId = `_test-evt-journey-onetime-fail-${Date.now()}`;
        state.invoiceId = `_test-inv-onetime-fail-${Date.now()}`;
        state.orderId = `0000-0000-0000`; // Fake orderId for test

        // Send invoice.payment_failed with a non-subscription billing reason
        // This routes to category: 'one-time' in the webhook parser
        const response = await http.as('none').post(`payments/webhook?processor=test&key=${config.backendManagerKey}`, {
          id: state.eventId,
          type: 'invoice.payment_failed',
          data: {
            object: {
              id: state.invoiceId,
              object: 'invoice',
              billing_reason: 'manual',
              amount_due: 999,
              amount_paid: 0,
              status: 'open',
              metadata: {
                uid: state.uid,
                orderId: state.orderId,
                productId: state.productId,
              },
            },
          },
        });

        assert.isSuccess(response, 'Webhook should be accepted');
      },
    },

    {
      name: 'webhook-categorized-as-one-time',
      async run({ firestore, assert, state, waitFor }) {
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.eventId}`);
          return doc?.status === 'completed' || doc?.status === 'failed';
        }, 15000, 500);

        const webhookDoc = await firestore.get(`payments-webhooks/${state.eventId}`);
        assert.ok(webhookDoc, 'Webhook doc should exist');
        assert.equal(webhookDoc.event?.category, 'one-time', 'Category should be one-time');
        assert.equal(webhookDoc.event?.resourceType, 'invoice', 'Resource type should be invoice');
        assert.equal(webhookDoc.transition, 'purchase-failed', 'Transition should be purchase-failed');
      },
    },

    {
      name: 'order-doc-created-with-failure',
      async run({ firestore, assert, state }) {
        const orderDoc = await firestore.get(`payments-orders/${state.orderId}`);

        assert.ok(orderDoc, 'Order doc should exist');
        assert.equal(orderDoc.type, 'one-time', 'Type should be one-time');
        assert.equal(orderDoc.owner, state.uid, 'Owner should match');
        assert.equal(orderDoc.processor, 'test', 'Processor should be test');
        assert.ok(orderDoc.requests !== undefined, 'requests field should exist');
        assert.equal(orderDoc.requests.cancellation, null, 'requests.cancellation should be null');
        assert.equal(orderDoc.requests.refund, null, 'requests.refund should be null');
      },
    },

    {
      name: 'subscription-unchanged',
      async run({ firestore, assert, state }) {
        // One-time payment failures must NOT modify subscription state
        const userDoc = await firestore.get(`users/${state.uid}`);

        assert.equal(
          userDoc.subscription?.product?.id,
          'basic',
          'Subscription should remain basic after one-time failure',
        );
      },
    },
  ],
};
