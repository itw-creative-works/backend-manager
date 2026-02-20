/**
 * Test: Payment Journey - Upgrade
 * Simulates: basic user → test intent → auto-webhook → paid active subscription
 *
 * Uses the test processor to exercise the full intent→webhook→trigger pipeline
 * Product-agnostic: resolves the first paid product from config.payment.products
 */
module.exports = {
  description: 'Payment journey: basic → paid upgrade via test intent',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'verify-starts-as-basic',
      async run({ accounts, firestore, assert, state, config }) {
        const uid = accounts['journey-payments-upgrade'].uid;
        const userDoc = await firestore.get(`users/${uid}`);

        assert.ok(userDoc, 'User doc should exist');
        assert.equal(userDoc.subscription?.product?.id, 'basic', 'Should start as basic');
        assert.equal(userDoc.subscription?.status, 'active', 'Should be active');

        // Resolve first paid product from config
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices);
        assert.ok(paidProduct, 'Config should have at least one paid product');

        state.uid = uid;
        state.paidProductId = paidProduct.id;
        state.paidProductName = paidProduct.name;
      },
    },

    {
      name: 'create-test-intent',
      async run({ http, assert, state }) {
        const response = await http.as('journey-payments-upgrade').post('payments/intent', {
          processor: 'test',
          productId: state.paidProductId,
          frequency: 'monthly',
        });

        assert.isSuccess(response, 'Intent should succeed');
        assert.ok(response.data.id, 'Should return intent ID');
        assert.ok(response.data.url, 'Should return URL');

        state.intentId = response.data.id;
      },
    },

    {
      name: 'subscription-activated',
      async run({ firestore, assert, state, waitFor }) {
        // Poll user doc until subscription changes from basic to paid
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${state.uid}`);
          return userDoc?.subscription?.product?.id === state.paidProductId;
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${state.uid}`);

        assert.equal(userDoc.subscription.product.id, state.paidProductId, `Product should be ${state.paidProductId}`);
        assert.equal(userDoc.subscription.status, 'active', 'Status should be active');
        assert.equal(userDoc.subscription.payment.processor, 'test', 'Processor should be test');
        assert.ok(userDoc.subscription.payment.resourceId, 'Resource ID should be set');
        assert.equal(userDoc.subscription.payment.frequency, 'monthly', 'Frequency should be monthly');
        assert.equal(userDoc.subscription.cancellation.pending, false, 'Should not be pending cancellation');

        state.subscriptionId = userDoc.subscription.payment.resourceId;
      },
    },

    {
      name: 'subscription-doc-created',
      async run({ firestore, assert, state }) {
        const subDoc = await firestore.get(`payments-subscriptions/${state.subscriptionId}`);

        assert.ok(subDoc, 'Subscription doc should exist');
        assert.equal(subDoc.uid, state.uid, 'UID should match');
        assert.equal(subDoc.processor, 'test', 'Processor should be test');
        assert.equal(subDoc.subscription.product.id, state.paidProductId, `Product should be ${state.paidProductId}`);
        assert.equal(subDoc.subscription.status, 'active', 'Status should be active');
      },
    },

    {
      name: 'intent-doc-created',
      async run({ firestore, assert, state }) {
        const intentDoc = await firestore.get(`payments-intents/${state.intentId}`);

        assert.ok(intentDoc, 'Intent doc should exist');
        assert.equal(intentDoc.uid, state.uid, 'UID should match');
        assert.equal(intentDoc.processor, 'test', 'Processor should be test');
        assert.equal(intentDoc.status, 'pending', 'Intent status should be pending');
        assert.equal(intentDoc.productId, state.paidProductId, `Product should be ${state.paidProductId}`);
      },
    },
  ],
};
