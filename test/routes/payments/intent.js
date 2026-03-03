/**
 * Test: POST /payments/intent
 * Tests intent creation endpoint validation + end-to-end flow via test processor
 *
 * Validation tests use processor=stripe (fail at SDK step, proving validation logic)
 * Success tests use processor=test (full intent→webhook→trigger pipeline)
 *
 * Product-agnostic: resolves the first paid product from config.payment.products
 */
module.exports = {
  description: 'Payment intent creation',
  type: 'group',
  timeout: 30000,

  tests: [
    {
      name: 'rejects-unauthenticated',
      auth: 'none',
      async run({ http, assert, config }) {
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices);

        const response = await http.as('none').post('payments/intent', {
          processor: 'stripe',
          productId: paidProduct.id,
          frequency: 'monthly',
        });

        assert.isError(response, 401, 'Should reject unauthenticated request');
      },
    },

    {
      name: 'rejects-missing-processor',
      async run({ http, assert, config }) {
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices);

        const response = await http.as('basic').post('payments/intent', {
          productId: paidProduct.id,
          frequency: 'monthly',
        });

        assert.isError(response, 400, 'Should reject missing processor');
      },
    },

    {
      name: 'rejects-missing-product-id',
      async run({ http, assert }) {
        const response = await http.as('basic').post('payments/intent', {
          processor: 'stripe',
          frequency: 'monthly',
        });

        assert.isError(response, 400, 'Should reject missing productId');
      },
    },

    {
      name: 'rejects-missing-frequency-for-subscription',
      async run({ http, assert, config }) {
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.type === 'subscription' && p.prices);

        const response = await http.as('basic').post('payments/intent', {
          processor: 'stripe',
          productId: paidProduct.id,
        });

        assert.isError(response, 400, 'Should reject missing frequency for subscription product');
      },
    },

    {
      name: 'rejects-active-paid-user',
      auth: 'premium-active',
      async run({ http, assert, config }) {
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices);

        const response = await http.as('premium-active').post('payments/intent', {
          processor: 'stripe',
          productId: paidProduct.id,
          frequency: 'monthly',
        });

        assert.isError(response, 400, 'Should reject user with active subscription');
      },
    },

    {
      name: 'rejects-invalid-product',
      async run({ http, assert }) {
        const response = await http.as('basic').post('payments/intent', {
          processor: 'stripe',
          productId: 'nonexistent-product',
          frequency: 'monthly',
        });

        assert.isError(response, 400, 'Should reject invalid product');
      },
    },

    {
      name: 'rejects-unknown-processor',
      async run({ http, assert, config }) {
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices);

        const response = await http.as('basic').post('payments/intent', {
          processor: 'unknown-processor',
          productId: paidProduct.id,
          frequency: 'monthly',
        });

        assert.isError(response, 400, 'Should reject unknown processor');
      },
    },

    {
      name: 'succeeds-with-test-processor',
      async run({ http, assert, config, firestore, accounts, waitFor }) {
        const uid = accounts['journey-payments-intent'].uid;
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices);

        const response = await http.as('journey-payments-intent').post('payments/intent', {
          processor: 'test',
          productId: paidProduct.id,
          frequency: 'monthly',
        });

        assert.isSuccess(response, 'Should succeed with test processor');
        assert.ok(response.data.id, 'Should return intent ID');
        assert.ok(response.data.orderId, 'Should return orderId');
        assert.match(response.data.orderId, /^\d{4}-\d{4}-\d{4}$/, 'orderId should be XXXX-XXXX-XXXX format');
        assert.ok(response.data.url, 'Should return URL');

        // Verify intent doc was saved (keyed by orderId)
        const intentDoc = await firestore.get(`payments-intents/${response.data.orderId}`);
        assert.ok(intentDoc, 'Intent doc should exist');
        assert.equal(intentDoc.intentId, response.data.id, 'Intent ID should match response');
        assert.equal(intentDoc.processor, 'test', 'Processor should be test');
        assert.equal(intentDoc.productId, paidProduct.id, 'Product should match');

        // Wait for auto-webhook to process and activate the subscription
        await waitFor(async () => {
          const userDoc = await firestore.get(`users/${uid}`);
          return userDoc?.subscription?.product?.id === paidProduct.id;
        }, 15000, 500).catch(() => {});
      },
    },

    {
      name: 'downgrades-trial-for-user-with-history',
      async run({ http, assert, config, accounts, firestore, waitFor }) {
        const uid = accounts['journey-payments-intent-trial'].uid;
        const paidProduct = config.payment.products.find(p => p.id !== 'basic' && p.prices);
        const orderDocPath = `payments-orders/_test-order-history-${uid}`;

        // Create fake subscription history so user is ineligible for trial
        await firestore.set(orderDocPath, { owner: uid, type: 'subscription', processor: 'test', status: 'cancelled' });

        try {
          const response = await http.as('journey-payments-intent-trial').post('payments/intent', {
            processor: 'test',
            productId: paidProduct.id,
            frequency: 'monthly',
            trial: true,
          });

          // Should succeed (not reject with 400) — trial silently downgraded
          assert.isSuccess(response, 'Should not reject — trial silently downgraded');

          // Verify intent saved with trial=false (keyed by orderId)
          const intentDoc = await firestore.get(`payments-intents/${response.data.orderId}`);
          assert.equal(intentDoc.trial, false, 'Trial should be false (downgraded)');

          // Wait for auto-webhook to activate the subscription
          await waitFor(async () => {
            const userDoc = await firestore.get(`users/${uid}`);
            return userDoc?.subscription?.product?.id === paidProduct.id;
          }, 15000, 500).catch(() => {});
        } finally {
          await firestore.delete(orderDocPath);
        }
      },
    },
  ],
};
