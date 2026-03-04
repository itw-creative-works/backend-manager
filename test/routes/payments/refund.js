/**
 * Test: POST /payments/refund
 * Tests rejection cases and a full end-to-end refund flow with the test processor.
 *
 * Refund requires the subscription to be cancelled or pending cancellation.
 * The test processor simulates refund by writing a customer.subscription.deleted
 * webhook which triggers the existing pipeline.
 */
module.exports = {
  description: 'Payment refund endpoint',
  type: 'group',
  timeout: 30000,

  tests: [
    {
      name: 'rejects-unauthenticated',
      async run({ http, assert }) {
        const response = await http.as('none').post('payments/refund', {
          confirmed: true,
          reason: 'Too expensive',
        });

        assert.isError(response, 401, 'Should reject unauthenticated request');
      },
    },

    {
      name: 'rejects-missing-confirmed',
      async run({ http, assert }) {
        const response = await http.as('basic').post('payments/refund', {
          reason: 'Too expensive',
        });

        assert.isError(response, 400, 'Should reject missing confirmed field');
      },
    },

    {
      name: 'rejects-missing-reason',
      async run({ http, assert }) {
        const response = await http.as('basic').post('payments/refund', {
          confirmed: true,
        });

        assert.isError(response, 400, 'Should reject missing reason field');
      },
    },

    {
      name: 'rejects-basic-user',
      async run({ http, assert }) {
        const response = await http.as('basic').post('payments/refund', {
          confirmed: true,
          reason: 'Too expensive',
        });

        assert.isError(response, 400, 'Should reject basic user with no paid subscription');
      },
    },

    {
      name: 'rejects-active-subscription-without-cancellation',
      async run({ http, assert }) {
        // refund-active-no-cancel has an active subscription without pending cancellation
        const response = await http.as('refund-active-no-cancel').post('payments/refund', {
          confirmed: true,
          reason: 'Too expensive',
        });

        assert.isError(response, 400, 'Should reject active subscription that is not cancelled or pending cancellation');
      },
    },

    {
      name: 'rejects-payment-older-than-6-months',
      async run({ http, assert }) {
        // refund-expired-payment has a cancelled subscription with a payment older than 6 months
        const response = await http.as('refund-expired-payment').post('payments/refund', {
          confirmed: true,
          reason: 'Too expensive',
        });

        assert.isError(response, 400, 'Should reject payment older than 6 months');
      },
    },

    {
      name: 'rejects-no-processor-or-resource-id',
      async run({ http, assert }) {
        // refund-no-processor has a cancelled subscription but no processor
        const response = await http.as('refund-no-processor').post('payments/refund', {
          confirmed: true,
          reason: 'Too expensive',
        });

        assert.isError(response, 400, 'Should reject when no processor or resourceId is set');
      },
    },

    {
      name: 'rejects-unknown-processor',
      async run({ http, assert }) {
        // refund-unknown-processor has a cancelled subscription with unknown processor
        const response = await http.as('refund-unknown-processor').post('payments/refund', {
          confirmed: true,
          reason: 'Too expensive',
        });

        assert.isError(response, 400, 'Should reject unknown processor');
      },
    },

    {
      name: 'succeeds-with-test-processor',
      async run({ http, assert, config, accounts, firestore, waitFor }) {
        const uid = accounts['route-refund-success'].uid;
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices?.monthly);

        // Step 1: Create a test subscription intent to set up a proper paid subscription
        const intentResponse = await http.as('route-refund-success').post('payments/intent', {
          processor: 'test',
          productId: paidProduct.id,
          frequency: 'monthly',
        });

        assert.isSuccess(intentResponse, 'Intent should succeed');

        // Wait for the auto-webhook to activate the subscription
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${uid}`);
          return userDoc?.subscription?.payment?.processor === 'test'
            && userDoc?.subscription?.payment?.resourceId
            && userDoc?.subscription?.status === 'active';
        }, 15000, 500);

        // Step 2: Cancel the subscription first (refund requires cancellation)
        const cancelResponse = await http.as('route-refund-success').post('payments/cancel', {
          confirmed: true,
          reason: 'Too expensive',
        });

        assert.isSuccess(cancelResponse, 'Cancel should succeed');

        // Wait for cancellation.pending to be set via the webhook pipeline
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${uid}`);
          return userDoc?.subscription?.cancellation?.pending === true;
        }, 15000, 500);

        // Step 3: Request a refund
        const refundResponse = await http.as('route-refund-success').post('payments/refund', {
          confirmed: true,
          reason: 'Not satisfied with the service',
          feedback: 'Testing refund flow',
        });

        assert.isSuccess(refundResponse, 'Refund should succeed');
        assert.ok(refundResponse.data.success, 'Should return success: true');
        assert.ok(refundResponse.data.refund, 'Should return refund details');
        assert.isType(refundResponse.data.refund.amount, 'number', 'Refund amount should be a number');
        assert.equal(refundResponse.data.refund.full, true, 'Should be a full refund (test processor)');

        // Step 4: Verify subscription is cancelled via the webhook pipeline
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${uid}`);
          return userDoc?.subscription?.status === 'cancelled';
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.subscription?.status, 'cancelled', 'Subscription should be cancelled after refund');
      },
    },
  ],
};
