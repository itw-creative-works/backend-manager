/**
 * Test: Payment Journey - Suspend & Recover
 * Simulates: paid active → payment fails → suspended → payment succeeds → active again
 *
 * Uses test intent for initial subscription, then manual webhooks for suspend/recover
 * Product-agnostic: resolves the first paid product from config.payment.products
 */
module.exports = {
  description: 'Payment journey: paid → suspended → recovered via test processor',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'setup-paid-subscription',
      async run({ accounts, firestore, assert, state, config, http, waitFor }) {
        const uid = accounts['journey-payments-suspend'].uid;

        // Resolve first paid product from config
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices);
        assert.ok(paidProduct, 'Config should have at least one paid product');

        state.uid = uid;
        state.paidProductId = paidProduct.id;
        state.paidProductName = paidProduct.name;
        state.paidPriceId = paidProduct.prices.monthly.stripe;

        // Create subscription via test intent
        const response = await http.as('journey-payments-suspend').post('payments/intent', {
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
      name: 'send-past-due-webhook',
      async run({ http, assert, state, config }) {
        state.eventId1 = `_test-evt-journey-suspend-fail-${Date.now()}`;

        const response = await http.as('none').post(`payments/webhook?processor=test&key=${config.backendManagerKey}`, {
          id: state.eventId1,
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: state.subscriptionId,
              object: 'subscription',
              status: 'past_due',
              metadata: { uid: state.uid },
              cancel_at_period_end: false,
              canceled_at: null,
              current_period_end: Math.floor(Date.now() / 1000) + 86400,
              current_period_start: Math.floor(Date.now() / 1000) - 86400 * 29,
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
      name: 'subscription-suspended',
      async run({ firestore, assert, state, waitFor }) {
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.eventId1}`);
          return doc?.status === 'completed';
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${state.uid}`);

        assert.equal(userDoc.subscription.status, 'suspended', 'Status should be suspended');
        assert.equal(userDoc.subscription.product.id, state.paidProductId, `Product should still be ${state.paidProductId}`);
      },
    },

    {
      name: 'send-recovery-webhook',
      async run({ http, assert, state, config }) {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 1);

        state.eventId2 = `_test-evt-journey-suspend-recover-${Date.now()}`;

        const response = await http.as('none').post(`payments/webhook?processor=test&key=${config.backendManagerKey}`, {
          id: state.eventId2,
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: state.subscriptionId,
              object: 'subscription',
              status: 'active',
              metadata: { uid: state.uid },
              cancel_at_period_end: false,
              canceled_at: null,
              current_period_end: Math.floor(futureDate.getTime() / 1000),
              current_period_start: Math.floor(Date.now() / 1000),
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
      name: 'subscription-recovered',
      async run({ firestore, assert, state, waitFor }) {
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.eventId2}`);
          return doc?.status === 'completed';
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${state.uid}`);

        assert.equal(userDoc.subscription.status, 'active', 'Status should be active again');
        assert.equal(userDoc.subscription.product.id, state.paidProductId, `Product should still be ${state.paidProductId}`);
      },
    },
  ],
};
