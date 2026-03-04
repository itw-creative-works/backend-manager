/**
 * Test: Payment Journey - One-Time Purchase
 * Simulates: user → test intent (one-time product) → auto-webhook → purchase-completed
 *
 * Uses the test processor to exercise the full intent→webhook→trigger pipeline
 * for one-time payments. Unlike subscriptions, one-time payments only write to
 * payments-orders/{orderId} — they do NOT modify users/{uid}.subscription.
 *
 * Requires at least one product with type: 'one-time' in config.payment.products
 */
module.exports = {
  description: 'Payment journey: one-time purchase via test intent → purchase-completed',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'resolve-one-time-product',
      async run({ accounts, firestore, assert, state, config }) {
        const uid = accounts['journey-payments-one-time'].uid;
        const userDoc = await firestore.get(`users/${uid}`);

        assert.ok(userDoc, 'User doc should exist');

        // Resolve first one-time product from config
        const oneTimeProduct = config.payment.products.find(p => p.type === 'one-time' && p.prices?.once);
        assert.ok(oneTimeProduct, 'Config should have at least one one-time product');

        state.uid = uid;
        state.productId = oneTimeProduct.id;
        state.productName = oneTimeProduct.name;
        state.price = oneTimeProduct.prices.once;

        // Snapshot subscription before purchase — should remain unchanged after
        state.subscriptionBefore = userDoc.subscription || null;
      },
    },

    {
      name: 'create-one-time-intent',
      async run({ http, assert, state }) {
        const response = await http.as('journey-payments-one-time').post('payments/intent', {
          processor: 'test',
          productId: state.productId,
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
      name: 'webhook-transition-purchase-completed',
      async run({ firestore, assert, state, waitFor }) {
        // Poll until the webhook is processed
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.eventId}`);
          return doc?.status === 'completed';
        }, 15000, 500);

        const webhookDoc = await firestore.get(`payments-webhooks/${state.eventId}`);
        assert.ok(webhookDoc, 'Webhook doc should exist');
        assert.equal(webhookDoc.transition, 'purchase-completed', 'Transition should be purchase-completed');
        assert.equal(webhookDoc.orderId, state.orderId, 'Webhook doc orderId should match intent');
        assert.equal(webhookDoc.event?.category, 'one-time', 'Category should be one-time');
      },
    },

    {
      name: 'order-doc-created',
      async run({ firestore, assert, state }) {
        const orderDoc = await firestore.get(`payments-orders/${state.orderId}`);

        assert.ok(orderDoc, 'Order doc should exist');
        assert.equal(orderDoc.id, state.orderId, 'ID should match orderId');
        assert.equal(orderDoc.type, 'one-time', 'Type should be one-time');
        assert.equal(orderDoc.owner, state.uid, 'Owner should match');
        assert.equal(orderDoc.processor, 'test', 'Processor should be test');
        assert.equal(orderDoc.unified.product.id, state.productId, `Product should be ${state.productId}`);
        assert.equal(orderDoc.unified.payment.processor, 'test', 'Unified processor should be test');
        assert.equal(orderDoc.unified.payment.orderId, state.orderId, 'Unified orderId should match');
      },
    },

    {
      name: 'subscription-unchanged',
      async run({ firestore, assert, state }) {
        // One-time payments must NOT modify users/{uid}.subscription
        const userDoc = await firestore.get(`users/${state.uid}`);
        const subAfter = userDoc.subscription || null;

        assert.deepEqual(
          subAfter?.product?.id,
          state.subscriptionBefore?.product?.id,
          'Subscription product should be unchanged after one-time purchase',
        );
        assert.deepEqual(
          subAfter?.status,
          state.subscriptionBefore?.status,
          'Subscription status should be unchanged after one-time purchase',
        );
      },
    },

    {
      name: 'intent-doc-created',
      async run({ firestore, assert, state }) {
        const intentDoc = await firestore.get(`payments-intents/${state.orderId}`);

        assert.ok(intentDoc, 'Intent doc should exist');
        assert.equal(intentDoc.id, state.orderId, 'ID should match orderId');
        assert.equal(intentDoc.intentId, state.intentId, 'Intent ID should match processor session ID');
        assert.equal(intentDoc.owner, state.uid, 'Owner should match');
        assert.equal(intentDoc.processor, 'test', 'Processor should be test');
        assert.equal(intentDoc.productId, state.productId, `Product should be ${state.productId}`);
      },
    },
  ],
};
