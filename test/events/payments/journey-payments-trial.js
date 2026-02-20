/**
 * Test: Payment Journey - Trial
 * Simulates: basic user → trial activation via test intent → trial ends → active paid
 *
 * Uses the test processor for initial trial, then manual webhook for trial-to-active
 * Product-agnostic: resolves the first paid product from config.payment.products
 */
module.exports = {
  description: 'Payment journey: basic → trial → active paid via test processor',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'verify-starts-as-basic',
      async run({ accounts, firestore, assert, state, config }) {
        const uid = accounts['journey-payments-trial'].uid;
        const userDoc = await firestore.get(`users/${uid}`);

        assert.ok(userDoc, 'User doc should exist');
        assert.equal(userDoc.subscription?.product?.id, 'basic', 'Should start as basic');
        assert.equal(userDoc.subscription?.trial?.claimed, false, 'Trial should not be claimed');

        // Resolve first paid product from config
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices);
        assert.ok(paidProduct, 'Config should have at least one paid product');

        state.uid = uid;
        state.paidProductId = paidProduct.id;
        state.paidPriceId = paidProduct.prices.monthly.stripe;
      },
    },

    {
      name: 'create-trial-intent',
      async run({ http, assert, state }) {
        const response = await http.as('journey-payments-trial').post('payments/intent', {
          processor: 'test',
          productId: state.paidProductId,
          frequency: 'monthly',
          trial: true,
        });

        assert.isSuccess(response, 'Intent should succeed');
        assert.ok(response.data.id, 'Should return intent ID');

        state.intentId = response.data.id;
      },
    },

    {
      name: 'trial-activated',
      async run({ firestore, assert, state, waitFor }) {
        // Poll until trial subscription appears
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${state.uid}`);
          return userDoc?.subscription?.trial?.claimed === true;
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${state.uid}`);

        assert.equal(userDoc.subscription.product.id, state.paidProductId, `Product should be ${state.paidProductId}`);
        assert.equal(userDoc.subscription.status, 'active', 'Status should be active');
        assert.equal(userDoc.subscription.trial.claimed, true, 'Trial should be claimed');

        state.subscriptionId = userDoc.subscription.payment.resourceId;
      },
    },

    {
      name: 'send-trial-to-active-webhook',
      async run({ http, assert, state, config }) {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 1);

        state.eventId2 = `_test-evt-journey-trial-active-${Date.now()}`;

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
              start_date: Math.floor(Date.now() / 1000) - 86400 * 14,
              trial_start: Math.floor(Date.now() / 1000) - 86400 * 14,
              trial_end: Math.floor(Date.now() / 1000),
              plan: { id: state.paidPriceId, interval: 'month' },
            },
          },
        });

        assert.isSuccess(response, 'Webhook should be accepted');
      },
    },

    {
      name: 'trial-transitioned-to-active',
      async run({ firestore, assert, state, waitFor }) {
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.eventId2}`);
          return doc?.status === 'completed';
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${state.uid}`);

        assert.equal(userDoc.subscription.product.id, state.paidProductId, `Product should be ${state.paidProductId}`);
        assert.equal(userDoc.subscription.status, 'active', 'Status should be active');
        assert.equal(userDoc.subscription.trial.claimed, true, 'Trial should remain claimed (historical)');
        assert.equal(userDoc.subscription.payment.frequency, 'monthly', 'Frequency should be monthly');
      },
    },
  ],
};
