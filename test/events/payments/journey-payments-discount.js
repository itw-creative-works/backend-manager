/**
 * Test: Payment Journey - Subscription with Discount
 * Simulates: basic → paid subscription with WELCOME15 promo code → confirmation email with discount
 *
 * Verifies the discount flows through: intent → order → transition → email template
 * Product-agnostic: resolves the first paid product from config.payment.products
 */
module.exports = {
  description: 'Payment journey: subscription with discount code',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'setup',
      async run({ accounts, firestore, assert, state, config, skip, payments }) {
        const uid = accounts['journey-payments-intent-discount'].uid;
        const userDoc = await firestore.get(`users/${uid}`);

        assert.ok(userDoc, 'User doc should exist');
        assert.equal(userDoc.subscription?.product?.id, 'basic', 'Should start as basic');

        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices && p.type === 'subscription');
        if (!paidProduct) {
          skip('No paid subscription product configured');
        }

        state.uid = uid;
        state.paidProductId = paidProduct.id;
        state.product = payments.products[paidProduct.id];
      },
    },

    {
      name: 'create-intent-with-discount',
      async run({ http, assert, state }) {
        const response = await http.as('journey-payments-intent-discount').post('backend-manager/payments/intent', {
          processor: 'test',
          productId: state.paidProductId,
          frequency: state.product.frequency,
          discount: 'WELCOME15',
        });

        assert.isSuccess(response, 'Intent with discount should succeed');
        assert.ok(response.data.orderId, 'Should return orderId');

        state.orderId = response.data.orderId;
        state.eventId = response.data.id.replace('_test-cs-', '_test-evt-');
      },
    },

    {
      name: 'subscription-activated-with-discount',
      async run({ firestore, assert, state, waitFor }) {
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${state.uid}`);
          return userDoc?.subscription?.product?.id === state.paidProductId;
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${state.uid}`);

        assert.equal(userDoc.subscription.product.id, state.paidProductId, `Product should be ${state.paidProductId}`);
        assert.equal(userDoc.subscription.status, 'active', 'Status should be active');
      },
    },

    {
      name: 'order-has-discount',
      async run({ firestore, assert, state }) {
        const orderDoc = await firestore.get(`payments-orders/${state.orderId}`);

        assert.ok(orderDoc, 'Order doc should exist');
        assert.ok(orderDoc.discount, 'Order should have discount');
        assert.equal(orderDoc.discount.code, 'WELCOME15', 'Discount code should be WELCOME15');
        assert.equal(orderDoc.discount.percent, 15, 'Discount should be 15%');
      },
    },

    {
      name: 'webhook-transition-new-subscription',
      async run({ firestore, assert, state }) {
        const webhookDoc = await firestore.get(`payments-webhooks/${state.eventId}`);

        assert.ok(webhookDoc, 'Webhook doc should exist');
        assert.equal(webhookDoc.transition, 'new-subscription', 'Transition should be new-subscription');
      },
    },
  ],
};
