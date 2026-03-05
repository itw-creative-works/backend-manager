/**
 * Test: Payment Journey - Legacy Product ID Resolution
 * Simulates: webhook with a legacy Stripe product ID → resolves to the correct product
 *
 * Verifies Fix 4: when an existing subscriber's webhook carries a legacy product ID
 * (from before product migration), resolveProduct() checks stripe.legacyProductIds[]
 * and maps it to the correct current product.
 *
 * Flow:
 * 1. Find a config product that has stripe.legacyProductIds (skip if none)
 * 2. Send a customer.subscription.created webhook with the legacy product ID in plan.product
 * 3. Verify: subscription.product.id resolves to the correct (current) product ID
 *
 * This test is config-dependent — it requires at least one product with legacyProductIds.
 * If no such product exists, the test skips gracefully.
 */
module.exports = {
  description: 'Payment journey: webhook with legacy product ID → correct product resolution',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'find-product-with-legacy-ids',
      async run({ accounts, assert, state, config }) {
        const uid = accounts['journey-payments-legacy-product'].uid;
        state.uid = uid;

        // Find a paid product that has legacy Stripe product IDs configured
        const productWithLegacy = config.payment?.products?.find(
          p => p.id !== 'basic'
            && p.prices?.monthly
            && p.stripe?.legacyProductIds?.length > 0,
        );

        if (!productWithLegacy) {
          state.skip = true;
          console.log('No product with stripe.legacyProductIds found in config — skipping legacy product ID test');
          return;
        }

        state.skip = false;
        state.productId = productWithLegacy.id;
        state.productName = productWithLegacy.name;
        state.currentStripeProductId = productWithLegacy.stripe.productId;
        state.legacyStripeProductId = productWithLegacy.stripe.legacyProductIds[0];

        assert.ok(state.legacyStripeProductId, 'Legacy product ID should exist');
        assert.notEqual(state.legacyStripeProductId, state.currentStripeProductId, 'Legacy ID should differ from current ID');
      },
    },

    {
      name: 'send-webhook-with-legacy-product-id',
      async run({ http, assert, state, config }) {
        if (state.skip) {
          return;
        }

        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 1);

        state.legacyEventId = `_test-evt-journey-legacy-prod-${Date.now()}`;
        state.subscriptionId = `sub_test_legacy_${Date.now()}`;

        // Send a subscription created webhook with the LEGACY product ID
        // This simulates an existing subscriber whose Stripe subscription still
        // references the old product ID from before migration
        const response = await http.as('none').post(`payments/webhook?processor=test&key=${config.backendManagerKey}`, {
          id: state.legacyEventId,
          type: 'customer.subscription.created',
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
              start_date: Math.floor(Date.now() / 1000),
              trial_start: null,
              trial_end: null,
              // KEY: use the LEGACY product ID, not the current one
              plan: { product: state.legacyStripeProductId, interval: 'month' },
            },
          },
        });

        assert.isSuccess(response, 'Webhook with legacy product ID should be accepted');
      },
    },

    {
      name: 'legacy-product-resolved-correctly',
      async run({ firestore, assert, state, waitFor }) {
        if (state.skip) {
          return;
        }

        // Wait for webhook to complete
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.legacyEventId}`);
          return doc?.status === 'completed' || doc?.status === 'failed';
        }, 15000, 500);

        const webhookDoc = await firestore.get(`payments-webhooks/${state.legacyEventId}`);
        assert.equal(webhookDoc.status, 'completed', 'Webhook should complete successfully');
        assert.equal(webhookDoc.transition, 'new-subscription', 'Transition should be new-subscription');

        // Core assertion: the legacy product ID resolved to the correct current product
        const userDoc = await firestore.get(`users/${state.uid}`);
        assert.equal(
          userDoc.subscription.product.id,
          state.productId,
          `Legacy product ID "${state.legacyStripeProductId}" should resolve to "${state.productId}" (not "basic")`,
        );
        assert.equal(userDoc.subscription.status, 'active', 'Status should be active');
        assert.equal(userDoc.subscription.payment.processor, 'test', 'Processor should be test');
      },
    },

    {
      name: 'order-doc-has-correct-product',
      async run({ firestore, assert, state }) {
        if (state.skip) {
          return;
        }

        // Find the order doc — legacy webhook may not have an orderId from metadata,
        // so look it up by resourceId
        const orderQuery = await firestore.query('payments-orders', {
          where: [{ field: 'resourceId', op: '==', value: state.subscriptionId }],
          limit: 1,
        });

        if (orderQuery && orderQuery.length > 0) {
          const orderDoc = orderQuery[0];
          assert.equal(
            orderDoc.unified?.product?.id,
            state.productId,
            `Order unified product should be "${state.productId}"`,
          );
        }
      },
    },
  ],
};
