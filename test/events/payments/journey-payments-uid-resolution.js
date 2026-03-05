/**
 * Test: Payment Journey - UID Resolution Fallback
 * Simulates: paid active subscription → webhook with uid OMITTED from metadata
 *
 * Verifies Fix 1: when a webhook event doesn't carry uid in metadata (like PayPal's
 * PAYMENT.SALE events), the pipeline resolves uid from the fetched resource using
 * library.getUid() and persists it on the webhook doc.
 *
 * Flow:
 * 1. Set up paid subscription via test intent (establishes payments-orders doc with resourceId)
 * 2. Send customer.subscription.updated webhook WITHOUT uid in metadata
 * 3. Verify: webhook completes (not fails), uid resolved, subscription updated
 *
 * Product-agnostic: resolves the first paid product from config.payment.products
 */
module.exports = {
  description: 'Payment journey: webhook without uid → UID resolved from fetched resource',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'setup-paid-subscription',
      async run({ accounts, firestore, assert, state, config, http, waitFor }) {
        const uid = accounts['journey-payments-uid-resolution'].uid;

        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices?.monthly);
        assert.ok(paidProduct, 'Config should have at least one paid product with monthly price');

        state.uid = uid;
        state.paidProductId = paidProduct.id;
        state.paidStripeProductId = paidProduct.stripe?.productId;

        // Create subscription via test intent
        const response = await http.as('journey-payments-uid-resolution').post('payments/intent', {
          processor: 'test',
          productId: paidProduct.id,
          frequency: 'monthly',
        });
        assert.isSuccess(response, 'Intent should succeed');
        state.orderId = response.data.orderId;

        // Wait for subscription to activate
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${uid}`);
          return userDoc?.subscription?.product?.id === paidProduct.id
            && userDoc?.subscription?.status === 'active';
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${uid}`);
        state.subscriptionId = userDoc.subscription.payment.resourceId;

        assert.ok(state.subscriptionId, 'Subscription resource ID should exist');
      },
    },

    {
      name: 'send-webhook-without-uid',
      async run({ http, assert, state, config }) {
        // Send a subscription update webhook WITHOUT uid in metadata
        // The test processor's fetchResource() will look up payments-orders by resourceId
        // and reconstruct a Stripe-shaped subscription that includes metadata.uid
        // Then library.getUid() extracts uid from the fetched resource
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 1);

        state.noUidEventId = `_test-evt-journey-uid-resolve-${Date.now()}`;

        const response = await http.as('none').post(`payments/webhook?processor=test&key=${config.backendManagerKey}`, {
          id: state.noUidEventId,
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: state.subscriptionId,
              object: 'subscription',
              status: 'active',
              // NO metadata.uid — this is the key part of the test
              metadata: {},
              cancel_at_period_end: true,
              cancel_at: Math.floor(futureDate.getTime() / 1000),
              canceled_at: null,
              current_period_end: Math.floor(futureDate.getTime() / 1000),
              current_period_start: Math.floor(Date.now() / 1000),
              start_date: Math.floor(Date.now() / 1000) - 86400 * 30,
              trial_start: null,
              trial_end: null,
              plan: { product: state.paidStripeProductId, interval: 'month' },
            },
          },
        });

        assert.isSuccess(response, 'Webhook should be accepted (even without uid)');
      },
    },

    {
      name: 'uid-resolved-and-webhook-completed',
      async run({ firestore, assert, state, waitFor }) {
        // Wait for the webhook to be processed
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.noUidEventId}`);
          return doc?.status === 'completed' || doc?.status === 'failed';
        }, 15000, 500);

        const webhookDoc = await firestore.get(`payments-webhooks/${state.noUidEventId}`);

        // Core assertions: UID was resolved from the fetched resource
        assert.equal(webhookDoc.status, 'completed', 'Webhook should complete (not fail due to missing UID)');
        assert.equal(webhookDoc.owner, state.uid, 'Owner should be resolved to the correct UID');
        assert.equal(webhookDoc.orderId, state.orderId, 'Order ID should match');

        // Transition should be cancellation-requested (we sent cancel_at_period_end: true)
        assert.equal(webhookDoc.transition, 'cancellation-requested', 'Transition should be cancellation-requested');
      },
    },

    {
      name: 'subscription-updated-correctly',
      async run({ firestore, assert, state }) {
        const userDoc = await firestore.get(`users/${state.uid}`);

        // The webhook should have updated the user doc even though uid wasn't in the webhook metadata
        assert.equal(userDoc.subscription.status, 'active', 'Status should still be active');
        assert.equal(userDoc.subscription.cancellation.pending, true, 'Cancellation should be pending');
        assert.equal(userDoc.subscription.product.id, state.paidProductId, `Product should be ${state.paidProductId}`);
      },
    },
  ],
};
