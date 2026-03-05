/**
 * Test: Payment Journey - Trial Cancel
 * Simulates: basic user → trial activation → cancel during trial → immediate cancellation
 *
 * When a user cancels during a free trial, the subscription should be cancelled immediately
 * (not scheduled for period end) to avoid giving free premium access for the remainder of the trial.
 *
 * Uses the test processor for initial trial, then cancel endpoint for cancellation.
 * Product-agnostic: resolves the first paid product from config.payment.products
 */
module.exports = {
  description: 'Payment journey: trial → cancel during trial → immediate cancellation',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'verify-starts-as-basic',
      async run({ accounts, firestore, assert, state, config }) {
        const uid = accounts['journey-payments-trial-cancel'].uid;
        const userDoc = await firestore.get(`users/${uid}`);

        assert.ok(userDoc, 'User doc should exist');
        assert.equal(userDoc.subscription?.product?.id, 'basic', 'Should start as basic');
        assert.equal(userDoc.subscription?.trial?.claimed, false, 'Trial should not be claimed');

        // Resolve first paid product with trial from config
        const trialProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices && p.trial?.days);
        assert.ok(trialProduct, 'Config should have at least one paid product with trial');

        state.uid = uid;
        state.paidProductId = trialProduct.id;
        state.paidProductName = trialProduct.name;
      },
    },

    {
      name: 'create-trial-intent',
      async run({ http, assert, state }) {
        const response = await http.as('journey-payments-trial-cancel').post('payments/intent', {
          processor: 'test',
          productId: state.paidProductId,
          frequency: 'monthly',
          trial: true,
        });

        assert.isSuccess(response, 'Intent should succeed');
        assert.ok(response.data.id, 'Should return intent ID');
        assert.ok(response.data.orderId, 'Should return orderId');

        state.intentId = response.data.id;
        state.orderId = response.data.orderId;
        state.eventId = response.data.id.replace('_test-cs-', '_test-evt-');
      },
    },

    {
      name: 'trial-activated',
      async run({ firestore, assert, state, waitFor }) {
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${state.uid}`);
          return userDoc?.subscription?.trial?.claimed === true;
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${state.uid}`);

        assert.equal(userDoc.subscription.product.id, state.paidProductId, `Product should be ${state.paidProductId}`);
        assert.equal(userDoc.subscription.status, 'active', 'Status should be active');
        assert.equal(userDoc.subscription.trial.claimed, true, 'Trial should be claimed');
        assert.equal(userDoc.subscription.trial.expires.timestampUNIX, userDoc.subscription.expires.timestampUNIX, 'Trial expires should match subscription expires (still in trial period)');

        state.subscriptionId = userDoc.subscription.payment.resourceId;
      },
    },

    {
      name: 'cancel-during-trial',
      async run({ http, assert }) {
        // Cancel via endpoint — test processor should detect trial and simulate immediate cancel
        const response = await http.as('journey-payments-trial-cancel').post('payments/cancel', {
          confirmed: true,
          reason: 'Changed my mind during trial',
          feedback: 'Testing trial cancellation',
        });

        assert.isSuccess(response, 'Cancel endpoint should succeed');
        assert.equal(response.data.success, true, 'Should return { success: true }');
      },
    },

    {
      name: 'verify-immediate-cancellation',
      async run({ firestore, assert, state, waitFor }) {
        // Poll until subscription is cancelled (NOT just pending)
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${state.uid}`);
          return userDoc?.subscription?.status === 'cancelled';
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${state.uid}`);

        // During trial cancel: subscription should be immediately cancelled, not pending
        assert.equal(userDoc.subscription.status, 'cancelled', 'Status should be cancelled (not active with pending)');
        assert.equal(userDoc.subscription.cancellation.pending, false, 'Should NOT be pending — should be fully cancelled');
        assert.equal(userDoc.subscription.product.id, state.paidProductId, `Product should still be ${state.paidProductId}`);
      },
    },
  ],
};
