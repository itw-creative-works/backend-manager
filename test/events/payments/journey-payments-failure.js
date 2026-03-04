/**
 * Test: Payment Journey - Invoice Payment Failure
 * Simulates: basic → paid subscription → invoice.payment_failed → suspended
 *
 * Unlike journey-payments-suspend (which uses customer.subscription.updated with past_due),
 * this test uses the invoice.payment_failed event with billing_reason: subscription_cycle.
 * This verifies the new parseWebhook routing that determines category from invoice data.
 *
 * Product-agnostic: resolves the first paid product from config.payment.products
 */
module.exports = {
  description: 'Payment journey: paid → invoice.payment_failed → suspended',
  type: 'suite',
  timeout: 30000,

  tests: [
    {
      name: 'setup-paid-subscription',
      async run({ accounts, firestore, assert, state, config, http, waitFor }) {
        const uid = accounts['journey-payments-failure'].uid;

        // Resolve first paid subscription product
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.type === 'subscription' && p.prices);
        assert.ok(paidProduct, 'Config should have at least one paid subscription product');

        state.uid = uid;
        state.paidProductId = paidProduct.id;
        state.paidProductName = paidProduct.name;
        state.paidStripeProductId = paidProduct.stripe?.productId;

        // Create subscription via test intent
        const response = await http.as('journey-payments-failure').post('payments/intent', {
          processor: 'test',
          productId: paidProduct.id,
          frequency: 'monthly',
        });
        assert.isSuccess(response, 'Intent should succeed');
        state.orderId = response.data.orderId;

        // Wait for subscription to activate
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${uid}`);
          return userDoc?.subscription?.product?.id === paidProduct.id;
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc.subscription?.product?.id, paidProduct.id, `Should start as ${paidProduct.id}`);
        assert.equal(userDoc.subscription?.status, 'active', 'Should be active');
        assert.equal(userDoc.subscription?.payment?.orderId, state.orderId, 'Order ID should match intent');

        state.subscriptionId = userDoc.subscription.payment.resourceId;
      },
    },

    {
      name: 'send-invoice-payment-failed',
      async run({ http, assert, state, config }) {
        state.eventId = `_test-evt-journey-failure-${Date.now()}`;

        // Send invoice.payment_failed with subscription billing reason
        // This tests the new parseWebhook routing: billing_reason=subscription_cycle → subscription category
        const response = await http.as('none').post(`payments/webhook?processor=test&key=${config.backendManagerKey}`, {
          id: state.eventId,
          type: 'invoice.payment_failed',
          data: {
            object: {
              id: `in_test_failure_${Date.now()}`,
              object: 'invoice',
              billing_reason: 'subscription_cycle',
              amount_due: 999,
              amount_paid: 0,
              status: 'open',
              parent: {
                subscription_details: {
                  subscription: state.subscriptionId,
                  metadata: { uid: state.uid },
                },
                type: 'subscription_details',
              },
            },
          },
        });

        assert.isSuccess(response, 'Webhook should be accepted');
      },
    },

    {
      name: 'verify-webhook-categorized-as-subscription',
      async run({ firestore, assert, state, waitFor }) {
        // Wait for webhook doc to be saved
        await waitFor(async () => {
          const doc = await firestore.get(`payments-webhooks/${state.eventId}`);
          return doc?.status === 'completed' || doc?.status === 'failed';
        }, 15000, 500);

        const webhookDoc = await firestore.get(`payments-webhooks/${state.eventId}`);
        assert.ok(webhookDoc, 'Webhook doc should exist');
        assert.equal(webhookDoc.event?.category, 'subscription', 'Category should be subscription');
        assert.equal(webhookDoc.event?.resourceType, 'subscription', 'Resource type should be subscription');
        assert.equal(webhookDoc.event?.resourceId, state.subscriptionId, 'Resource ID should be subscription ID');
        assert.equal(webhookDoc.transition, 'payment-failed', 'Transition should be payment-failed');
      },
    },

    {
      name: 'subscription-suspended',
      async run({ firestore, assert, state }) {
        const userDoc = await firestore.get(`users/${state.uid}`);

        assert.equal(userDoc.subscription.status, 'suspended', 'Status should be suspended after payment failure');
        assert.equal(userDoc.subscription.product.id, state.paidProductId, `Product should still be ${state.paidProductId}`);
      },
    },
  ],
};
