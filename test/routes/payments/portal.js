/**
 * Test: POST /payments/portal - Validation errors
 * Tests rejection cases before any processor call is made.
 */
module.exports = {
  description: 'Payment portal endpoint: validation errors',
  type: 'group',
  timeout: 15000,

  tests: [
    {
      name: 'rejects-unauthenticated',
      async run({ http, assert }) {
        const response = await http.as('none').post('payments/portal', {
          returnUrl: 'https://example.com/account',
        });

        assert.isError(response, 401, 'Should reject unauthenticated request');
      },
    },

    {
      name: 'rejects-basic-user',
      async run({ http, assert }) {
        const response = await http.as('basic').post('payments/portal', {
          returnUrl: 'https://example.com/account',
        });

        assert.isError(response, 400, 'Should reject basic user with no paid subscription');
      },
    },

    {
      name: 'rejects-no-processor',
      async run({ http, assert }) {
        // portal-no-processor starts with payment.processor=null
        const response = await http.as('portal-no-processor').post('payments/portal', {
          returnUrl: 'https://example.com/account',
        });

        assert.isError(response, 400, 'Should reject when no processor is set');
      },
    },

    {
      name: 'rejects-unknown-processor',
      async run({ http, assert }) {
        // portal-unknown-processor starts with processor='unknown-processor'
        const response = await http.as('portal-unknown-processor').post('payments/portal', {
          returnUrl: 'https://example.com/account',
        });

        assert.isError(response, 400, 'Should reject unknown processor');
      },
    },

    {
      name: 'succeeds-with-test-processor',
      async run({ http, assert, config, accounts, firestore, waitFor }) {
        const uid = accounts['journey-payments-portal-route'].uid;
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices?.monthly);

        // Set up a paid subscription with the test processor
        const intentResponse = await http.as('journey-payments-portal-route').post('payments/intent', {
          processor: 'test',
          productId: paidProduct.id,
          frequency: 'monthly',
        });

        assert.isSuccess(intentResponse, 'Intent should succeed');

        // Wait for the auto-webhook to activate the subscription
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${uid}`);
          return userDoc?.subscription?.payment?.processor === 'test'
            && userDoc?.subscription?.status === 'active';
        }, 15000, 500);

        // Call the portal endpoint
        const portalResponse = await http.as('journey-payments-portal-route').post('payments/portal', {
          returnUrl: 'https://example.com/account',
        });

        assert.isSuccess(portalResponse, 'Portal should succeed');
        assert.ok(portalResponse.data.url, 'Should return a URL');
      },
    },
  ],
};
