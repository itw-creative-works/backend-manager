/**
 * Test: Payment Journey - Plan Change
 * Simulates: basic → paid product A → plan-changed webhook → paid product B
 *
 * Uses test intent for initial subscription, then manual webhook to change plans.
 * Requires at least two paid subscription products in config.
 */
module.exports = {
  description: 'Payment journey: paid product A → plan-changed → paid product B',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'setup-paid-subscription',
      async run({ accounts, firestore, assert, state, config, http, waitFor }) {
        const uid = accounts['journey-payments-plan-change'].uid;

        // Resolve two distinct paid subscription products from config
        const paidProducts = config.payment.products.filter(p => p.id !== 'basic' && p.type === 'subscription' && p.prices);
        assert.ok(paidProducts.length >= 2, 'Config should have at least two paid subscription products');

        const productA = paidProducts[0];
        const productB = paidProducts[1];

        state.uid = uid;
        state.productA = { id: productA.id, name: productA.name, priceId: productA.prices.monthly.stripe };
        state.productB = { id: productB.id, name: productB.name, priceId: productB.prices.monthly.stripe };

        // Create subscription via test intent (product A)
        const response = await http.as('journey-payments-plan-change').post('payments/intent', {
          processor: 'test',
          productId: productA.id,
          frequency: 'monthly',
        });
        assert.isSuccess(response, 'Intent should succeed');
        state.orderId = response.data.orderId;

        // Wait for subscription to activate
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${uid}`);
          return userDoc?.subscription?.product?.id === productA.id;
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc.subscription?.product?.id, productA.id, `Should start as ${productA.id}`);
        assert.equal(userDoc.subscription?.status, 'active', 'Should be active');

        state.subscriptionId = userDoc.subscription.payment.resourceId;
      },
    },

    {
      name: 'send-plan-change-webhook',
      async run({ http, assert, state, config }) {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 1);

        state.eventId = `_test-evt-journey-plan-change-${Date.now()}`;

        // Send subscription.updated with a different product's price ID
        const response = await http.as('none').post(`payments/webhook?processor=test&key=${config.backendManagerKey}`, {
          id: state.eventId,
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: state.subscriptionId,
              object: 'subscription',
              status: 'active',
              metadata: { uid: state.uid, orderId: state.orderId },
              cancel_at_period_end: false,
              canceled_at: null,
              current_period_end: Math.floor(futureDate.getTime() / 1000),
              current_period_start: Math.floor(Date.now() / 1000),
              start_date: Math.floor(Date.now() / 1000) - 86400 * 30,
              trial_start: null,
              trial_end: null,
              plan: { id: state.productB.priceId, interval: 'month' },
            },
          },
        });

        assert.isSuccess(response, 'Webhook should be accepted');
      },
    },

    {
      name: 'plan-changed-transition-detected',
      async run({ firestore, assert, state, waitFor }) {
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.eventId}`);
          return doc?.status === 'completed';
        }, 15000, 500);

        const webhookDoc = await firestore.get(`payments-webhooks/${state.eventId}`);
        assert.ok(webhookDoc, 'Webhook doc should exist');
        assert.equal(webhookDoc.transition, 'plan-changed', 'Transition should be plan-changed');
      },
    },

    {
      name: 'subscription-updated-to-product-b',
      async run({ firestore, assert, state }) {
        const userDoc = await firestore.get(`users/${state.uid}`);

        assert.equal(userDoc.subscription.product.id, state.productB.id, `Product should be ${state.productB.id}`);
        assert.equal(userDoc.subscription.product.name, state.productB.name, `Product name should be ${state.productB.name}`);
        assert.equal(userDoc.subscription.status, 'active', 'Status should still be active');
        assert.equal(userDoc.subscription.payment.processor, 'test', 'Processor should be test');
        assert.equal(userDoc.subscription.payment.frequency, 'monthly', 'Frequency should be monthly');
        assert.equal(userDoc.subscription.payment.resourceId, state.subscriptionId, 'Resource ID should be the same subscription');
      },
    },

    {
      name: 'order-doc-updated',
      async run({ firestore, assert, state }) {
        const orderDoc = await firestore.get(`payments-orders/${state.orderId}`);

        assert.ok(orderDoc, 'Order doc should exist');
        assert.equal(orderDoc.unified.product.id, state.productB.id, `Order product should be ${state.productB.id}`);
        assert.equal(orderDoc.unified.status, 'active', 'Order status should be active');
      },
    },
  ],
};
