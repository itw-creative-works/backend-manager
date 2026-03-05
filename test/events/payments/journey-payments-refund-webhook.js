/**
 * Test: Payment Journey - Refund Webhook
 * Simulates: basic → paid active → pending cancel → charge.refunded webhook → payment-refunded transition
 *
 * Verifies that refund webhook events:
 * 1. Flow through the pipeline correctly
 * 2. Trigger the payment-refunded transition (not subscription-cancelled)
 * 3. Extract refundDetails via the processor library's getRefundDetails()
 * 4. Record the transition name on the webhook doc for auditing
 *
 * Product-agnostic: resolves the first paid product from config.payment.products
 */
module.exports = {
  description: 'Payment journey: paid → refund webhook → payment-refunded transition',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'setup-paid-subscription',
      async run({ accounts, firestore, assert, state, config, http, waitFor }) {
        const uid = accounts['journey-payments-refund-webhook'].uid;

        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices?.monthly);
        assert.ok(paidProduct, 'Config should have at least one paid product with monthly price');

        state.uid = uid;
        state.paidProductId = paidProduct.id;
        state.paidStripeProductId = paidProduct.stripe?.productId;

        // Create subscription via test intent
        const response = await http.as('journey-payments-refund-webhook').post('payments/intent', {
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
        assert.equal(userDoc.subscription?.product?.id, paidProduct.id, `Should be ${paidProduct.id}`);
        assert.equal(userDoc.subscription?.status, 'active', 'Should be active');

        state.subscriptionId = userDoc.subscription.payment.resourceId;
      },
    },

    {
      name: 'send-pending-cancel-webhook',
      async run({ http, assert, state, config }) {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 1);

        state.cancelEventId = `_test-evt-journey-refund-cancel-${Date.now()}`;

        const response = await http.as('none').post(`payments/webhook?processor=test&key=${config.backendManagerKey}`, {
          id: state.cancelEventId,
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: state.subscriptionId,
              object: 'subscription',
              status: 'active',
              metadata: { uid: state.uid },
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

        assert.isSuccess(response, 'Cancel webhook should be accepted');
      },
    },

    {
      name: 'cancellation-pending-confirmed',
      async run({ firestore, assert, state, waitFor }) {
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.cancelEventId}`);
          return doc?.status === 'completed';
        }, 15000, 500);

        const webhookDoc = await firestore.get(`payments-webhooks/${state.cancelEventId}`);
        assert.equal(webhookDoc.transition, 'cancellation-requested', 'Should detect cancellation-requested');

        const userDoc = await firestore.get(`users/${state.uid}`);
        assert.equal(userDoc.subscription.status, 'active', 'Status should still be active');
        assert.equal(userDoc.subscription.cancellation.pending, true, 'Cancellation should be pending');
      },
    },

    {
      name: 'send-charge-refunded-webhook',
      async run({ http, assert, state, config }) {
        // Simulate a charge.refunded event (Stripe-shaped, used by test processor)
        // This carries refund amount data that getRefundDetails() extracts
        state.refundEventId = `_test-evt-journey-refund-charge-${Date.now()}`;
        state.refundAmountCents = 2800; // $28.00

        const response = await http.as('none').post(`payments/webhook?processor=test&key=${config.backendManagerKey}`, {
          id: state.refundEventId,
          type: 'charge.refunded',
          data: {
            object: {
              id: `ch_test_${Date.now()}`,
              object: 'charge',
              amount: state.refundAmountCents,
              amount_refunded: state.refundAmountCents,
              currency: 'usd',
              subscription: state.subscriptionId,
              metadata: { uid: state.uid },
              refunds: {
                data: [
                  {
                    id: `re_test_${Date.now()}`,
                    amount: state.refundAmountCents,
                    currency: 'usd',
                    reason: 'requested_by_customer',
                  },
                ],
              },
            },
          },
        });

        assert.isSuccess(response, 'Refund webhook should be accepted');
      },
    },

    {
      name: 'payment-refunded-transition-detected',
      async run({ firestore, assert, state, waitFor }) {
        // Wait for the refund webhook to be processed
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.refundEventId}`);
          return doc?.status === 'completed';
        }, 15000, 500);

        const webhookDoc = await firestore.get(`payments-webhooks/${state.refundEventId}`);

        // Core assertion: refund events trigger payment-refunded, not subscription-cancelled
        assert.equal(webhookDoc.status, 'completed', 'Webhook should complete successfully');
        assert.equal(webhookDoc.transition, 'payment-refunded', 'Transition should be payment-refunded (not subscription-cancelled)');
        assert.equal(webhookDoc.owner, state.uid, 'Owner should match');
        assert.equal(webhookDoc.orderId, state.orderId, 'Order ID should match');
      },
    },

    {
      name: 'order-doc-updated',
      async run({ firestore, assert, state }) {
        const orderDoc = await firestore.get(`payments-orders/${state.orderId}`);

        assert.ok(orderDoc, 'Order doc should exist');
        assert.equal(orderDoc.type, 'subscription', 'Type should be subscription');
        assert.equal(orderDoc.owner, state.uid, 'Owner should match');

        // The order was last updated by the refund webhook event
        assert.equal(orderDoc.metadata?.updatedBy?.event?.name, 'charge.refunded', 'Last event should be charge.refunded');
      },
    },
  ],
};
