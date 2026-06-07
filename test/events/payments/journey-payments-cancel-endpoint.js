/**
 * Test: Payment Journey - Cancel via endpoint
 * Simulates: paid active → POST /payments/cancel → cancellation pending
 *
 * The test processor's cancelAtPeriodEnd writes a Stripe-shaped webhook doc directly
 * to payments-webhooks/{eventId}, triggering the full on-write pipeline automatically.
 * Product-agnostic: resolves the first paid product from config.payment.products
 */
module.exports = {
  description: 'Payment journey: cancel endpoint → cancellation pending',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'setup-paid-subscription',
      async run({ accounts, firestore, assert, state, config, http, waitFor, skip, payments }) {
        const uid = accounts['journey-payments-cancel-route'].uid;
        // Resolve first paid product from config. If the brand has none configured,
        // skip the entire journey — this is a config-gap, not a code failure.
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices);
        if (!paidProduct) {
          skip('No paid product configured in this brand');
        }

        state.uid = uid;
        state.paidProductId = paidProduct.id;
        state.product = payments.products[paidProduct.id];
        // Create subscription via test intent — auto-fires webhook pipeline
        const response = await http.as('journey-payments-cancel-route').post('backend-manager/payments/intent', {
          processor: 'test',
          productId: paidProduct.id,
          frequency: state.product.frequency,
        });
        assert.isSuccess(response, 'Intent should succeed');
        state.orderId = response.data.orderId;

        // Wait for subscription to activate
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${uid}`);
          return userDoc?.subscription?.product?.id === paidProduct.id;
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc.subscription?.product?.id, paidProduct.id, `Should be ${paidProduct.id}`);
        assert.equal(userDoc.subscription?.status, 'active', 'Should be active');
        assert.equal(userDoc.subscription?.cancellation?.pending, false, 'Should not be pending cancellation');
      },
    },

    {
      name: 'call-cancel-endpoint',
      async run({ http, assert }) {
        // Test processor writes a payments-webhooks doc directly,
        // triggering the on-write pipeline automatically — no manual webhook needed.
        // skipGuards bypasses the 24-hour subscription-age guard.
        const response = await http.as('journey-payments-cancel-route').post('backend-manager/payments/cancel', {
          confirmed: true,
          reason: 'Too expensive',
          feedback: 'Would return at a lower price',
          skipGuards: true,
        });

        assert.isSuccess(response, 'Cancel endpoint should succeed');
        assert.equal(response.data.success, true, 'Should return { success: true }');
      },
    },

    {
      name: 'verify-cancellation-pending',
      async run({ firestore, assert, state, waitFor }) {
        // Poll user doc until the on-write pipeline updates subscription state
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${state.uid}`);
          return userDoc?.subscription?.cancellation?.pending === true;
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${state.uid}`);
        assert.equal(userDoc.subscription.status, 'active', 'Status should still be active');
        assert.equal(userDoc.subscription.cancellation.pending, true, 'Cancellation should be pending');
        assert.ok(userDoc.subscription.cancellation.date.timestampUNIX > 0, 'Cancellation date should be set');
      },
    },

    {
      name: 'cancellation-request-stored',
      async run({ firestore, assert, state }) {
        const orderDoc = await firestore.get(`payments-orders/${state.orderId}`);

        assert.ok(orderDoc, 'Order doc should exist');
        assert.ok(orderDoc.requests, 'requests field should exist');
        assert.ok(orderDoc.requests.cancellation, 'requests.cancellation should be populated');
        assert.equal(orderDoc.requests.cancellation.reason, 'Too expensive', 'Cancellation reason should match');
        assert.equal(orderDoc.requests.cancellation.feedback, 'Would return at a lower price', 'Cancellation feedback should match');
        assert.ok(orderDoc.requests.cancellation.date.timestampUNIX > 0, 'Cancellation date should be set');
        assert.equal(orderDoc.requests.refund, null, 'requests.refund should still be null');
      },
    },
  ],
};
