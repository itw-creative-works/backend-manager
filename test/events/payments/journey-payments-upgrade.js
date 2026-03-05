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
        assert.ok(response.data.orderId, 'Should return orderId');
        assert.match(response.data.orderId, /^\d{4}-\d{4}-\d{4}$/, 'orderId should be XXXX-XXXX-XXXX format');
        assert.ok(response.data.url, 'Should return URL');

        state.intentId = response.data.id;
        state.orderId = response.data.orderId;

        // Derive webhook event ID from intent ID (same timestamp)
        state.eventId = response.data.id.replace('_test-cs-', '_test-evt-');
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
        assert.equal(userDoc.subscription.payment.orderId, state.orderId, 'Order ID should match intent');
        assert.ok(userDoc.subscription.payment.resourceId, 'Resource ID should be set');
        assert.equal(userDoc.subscription.payment.frequency, 'monthly', 'Frequency should be monthly');
        assert.equal(userDoc.subscription.cancellation.pending, false, 'Should not be pending cancellation');

        state.subscriptionId = userDoc.subscription.payment.resourceId;
      },
    },

    {
      name: 'order-doc-created',
      async run({ firestore, assert, state }) {
        const orderDoc = await firestore.get(`payments-orders/${state.orderId}`);

        assert.ok(orderDoc, 'Order doc should exist');
        assert.equal(orderDoc.id, state.orderId, 'ID should match orderId');
        assert.equal(orderDoc.type, 'subscription', 'Type should be subscription');
        assert.equal(orderDoc.owner, state.uid, 'Owner should match');
        assert.equal(orderDoc.processor, 'test', 'Processor should be test');
        assert.equal(orderDoc.resourceId, state.subscriptionId, 'Resource ID should match');
        assert.equal(orderDoc.unified.product.id, state.paidProductId, `Product should be ${state.paidProductId}`);
        assert.equal(orderDoc.unified.status, 'active', 'Status should be active');
      },
    },

    {
      name: 'webhook-transition-new-subscription',
      async run({ firestore, assert, state, waitFor }) {
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.eventId}`);
          return doc?.status === 'completed';
        }, 15000, 500);

        const webhookDoc = await firestore.get(`payments-webhooks/${state.eventId}`);
        assert.ok(webhookDoc, 'Webhook doc should exist');
        assert.equal(webhookDoc.transition, 'new-subscription', 'Transition should be new-subscription');
        assert.equal(webhookDoc.orderId, state.orderId, 'Webhook doc orderId should match intent');
      },
    },

    {
      name: 'intent-doc-completed',
      async run({ firestore, assert, state }) {
        const intentDoc = await firestore.get(`payments-intents/${state.orderId}`);

        assert.ok(intentDoc, 'Intent doc should exist');
        assert.equal(intentDoc.id, state.orderId, 'ID should match orderId');
        assert.equal(intentDoc.intentId, state.intentId, 'Intent ID should match processor session ID');
        assert.equal(intentDoc.owner, state.uid, 'Owner should match');
        assert.equal(intentDoc.processor, 'test', 'Processor should be test');
        assert.equal(intentDoc.status, 'completed', 'Intent status should be completed after webhook processing');
        assert.equal(intentDoc.productId, state.paidProductId, `Product should be ${state.paidProductId}`);
        assert.ok(intentDoc.metadata?.completed?.timestampUNIX > 0, 'Completed timestamp should be set');
      },
    },
  ],
};
