/**
 * Test: Payment Journey - Cancel
 * Simulates: paid active → pending cancel → cancelled
 *
 * Uses test intent for initial subscription, then manual webhooks for cancel flow
 * Product-agnostic: resolves the first paid product from config.payment.products
 */
module.exports = {
  description: 'Payment journey: paid → pending cancel → cancelled',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'setup-paid-subscription',
      async run({ accounts, firestore, assert, state, config, http, waitFor }) {
        const uid = accounts['journey-payments-cancel'].uid;

        // Resolve first paid product from config
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices);
        assert.ok(paidProduct, 'Config should have at least one paid product');

        state.uid = uid;
        state.paidProductId = paidProduct.id;
        state.paidProductName = paidProduct.name;
        state.paidPriceId = paidProduct.prices.monthly.stripe;

        // Create subscription via test intent
        const response = await http.as('journey-payments-cancel').post('payments/intent', {
          processor: 'test',
          productId: paidProduct.id,
          frequency: 'monthly',
        });
        assert.isSuccess(response, 'Intent should succeed');

        // Wait for subscription to activate
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${uid}`);
          return userDoc?.subscription?.product?.id === paidProduct.id;
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc.subscription?.product?.id, paidProduct.id, `Should start as ${paidProduct.id}`);
        assert.equal(userDoc.subscription?.status, 'active', 'Should be active');

        state.subscriptionId = userDoc.subscription.payment.resourceId;
      },
    },

    {
      name: 'send-pending-cancel-webhook',
      async run({ http, assert, state, config }) {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);

        state.eventId1 = `_test-evt-journey-cancel-pending-${Date.now()}`;

        const response = await http.as('none').post(`payments/webhook?processor=test&key=${config.backendManagerKey}`, {
          id: state.eventId1,
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: state.subscriptionId,
              object: 'subscription',
              status: 'active',
              metadata: { uid: state.uid },
              cancel_at_period_end: true,
              cancel_at: Math.floor(futureDate.getTime() / 1000),
              canceled_at: null,
              current_period_end: Math.floor(futureDate.getTime() / 1000),
              current_period_start: Math.floor(Date.now() / 1000),
              start_date: Math.floor(Date.now() / 1000) - 86400 * 30,
              trial_start: null,
              trial_end: null,
              plan: { id: state.paidPriceId, interval: 'month' },
            },
          },
        });

        assert.isSuccess(response, 'Webhook should be accepted');
      },
    },

    {
      name: 'pending-cancel-processed',
      async run({ firestore, assert, state, waitFor }) {
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.eventId1}`);
          return doc?.status === 'completed';
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${state.uid}`);

        assert.equal(userDoc.subscription.status, 'active', 'Status should still be active');
        assert.equal(userDoc.subscription.cancellation.pending, true, 'Cancellation should be pending');
      },
    },

    {
      name: 'send-cancelled-webhook',
      async run({ http, assert, state, config }) {
        state.eventId2 = `_test-evt-journey-cancel-final-${Date.now()}`;

        const response = await http.as('none').post(`payments/webhook?processor=test&key=${config.backendManagerKey}`, {
          id: state.eventId2,
          type: 'customer.subscription.deleted',
          data: {
            object: {
              id: state.subscriptionId,
              object: 'subscription',
              status: 'canceled',
              metadata: { uid: state.uid },
              cancel_at_period_end: false,
              canceled_at: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000),
              current_period_start: Math.floor(Date.now() / 1000) - 86400 * 30,
              start_date: Math.floor(Date.now() / 1000) - 86400 * 60,
              trial_start: null,
              trial_end: null,
              plan: { id: state.paidPriceId, interval: 'month' },
            },
          },
        });

        assert.isSuccess(response, 'Webhook should be accepted');
      },
    },

    {
      name: 'subscription-cancelled',
      async run({ firestore, assert, state, waitFor }) {
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.eventId2}`);
          return doc?.status === 'completed';
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${state.uid}`);

        assert.equal(userDoc.subscription.status, 'cancelled', 'Status should be cancelled');
        assert.equal(userDoc.subscription.cancellation.pending, false, 'Cancellation should not be pending');
      },
    },
  ],
};
