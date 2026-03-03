/**
 * Test: POST /payments/cancel - Validation errors
 * Tests rejection cases before any processor call is made.
 * See test/events/payments/journey-payments-cancel-endpoint.js for the full end-to-end journey.
 */
module.exports = {
  description: 'Payment cancel endpoint: validation errors',
  type: 'group',
  timeout: 15000,

  tests: [
    {
      name: 'rejects-unauthenticated',
      async run({ http, assert }) {
        const response = await http.as('none').post('payments/cancel', {
          confirmed: true,
        });

        assert.isError(response, 401, 'Should reject unauthenticated request');
      },
    },

    {
      name: 'rejects-missing-confirmed',
      async run({ http, assert }) {
        const response = await http.as('basic').post('payments/cancel', {
          reason: 'Too expensive',
        });

        assert.isError(response, 400, 'Should reject missing confirmed field');
      },
    },

    {
      name: 'rejects-basic-user',
      async run({ http, assert }) {
        const response = await http.as('basic').post('payments/cancel', {
          confirmed: true,
        });

        assert.isError(response, 400, 'Should reject basic user with no paid subscription');
      },
    },

    {
      name: 'rejects-no-processor-or-resource-id',
      async run({ http, assert }) {
        // cancel-no-processor starts with payment.processor=null
        const response = await http.as('cancel-no-processor').post('payments/cancel', {
          confirmed: true,
        });

        assert.isError(response, 400, 'Should reject when no processor or resourceId is set');
      },
    },

    {
      name: 'rejects-already-pending-cancellation',
      async run({ http, assert }) {
        // cancel-already-pending starts with cancellation.pending=true
        const response = await http.as('cancel-already-pending').post('payments/cancel', {
          confirmed: true,
        });

        assert.isError(response, 400, 'Should reject when cancellation already pending');
      },
    },

    {
      name: 'rejects-unknown-processor',
      async run({ http, assert }) {
        // cancel-unknown-processor starts with processor='unknown-processor'
        const response = await http.as('cancel-unknown-processor').post('payments/cancel', {
          confirmed: true,
        });

        assert.isError(response, 400, 'Should reject unknown processor');
      },
    },

    {
      name: 'succeeds-with-test-processor',
      async run({ http, assert, config, accounts, firestore, waitFor }) {
        const uid = accounts['route-cancel-success'].uid;
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices?.monthly);

        // Step 1: Create a test subscription intent to set up a proper paid subscription
        const intentResponse = await http.as('route-cancel-success').post('payments/intent', {
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

        // Step 2: Call the cancel endpoint
        const cancelResponse = await http.as('route-cancel-success').post('payments/cancel', {
          confirmed: true,
          reason: 'Too expensive',
        });

        assert.isSuccess(cancelResponse, 'Cancel should succeed');
        assert.equal(cancelResponse.data.success, true, 'Should return success: true');

        // Step 3: Verify cancellation.pending was set via the webhook pipeline
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${uid}`);
          return userDoc?.subscription?.cancellation?.pending === true;
        }, 15000, 500);

        const userDoc = await firestore.get(`users/${uid}`);
        assert.equal(userDoc?.subscription?.cancellation?.pending, true, 'Cancellation should be pending');
      },
    },
  ],
};
