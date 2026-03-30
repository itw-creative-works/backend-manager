/**
 * Test: POST /payments/dispute-alert
 * Tests the dispute alert endpoint validates requests and saves to Firestore
 */
module.exports = {
  description: 'Dispute alert endpoint',
  type: 'group',
  timeout: 30000,

  tests: [
    {
      name: 'rejects-missing-key',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post('payments/dispute-alert', {});

        assert.isError(response, 401, 'Should reject missing key');
      },
    },

    {
      name: 'rejects-invalid-key',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post('payments/dispute-alert?key=wrong-key', {});

        assert.isError(response, 401, 'Should reject invalid key');
      },
    },

    {
      name: 'rejects-unknown-provider',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post(`payments/dispute-alert?provider=unknown&key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: '_test-dispute-unknown-provider',
          card: '4242',
          amount: 9.99,
          transactionDate: '2026-01-15',
        });

        assert.isError(response, 400, 'Should reject unknown alert provider');
      },
    },

    {
      name: 'rejects-missing-id',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post(`payments/dispute-alert?key=${process.env.BACKEND_MANAGER_KEY}`, {
          card: '4242',
          amount: 9.99,
          transactionDate: '2026-01-15',
        });

        assert.isError(response, 400, 'Should reject missing id');
      },
    },

    {
      name: 'rejects-missing-card',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post(`payments/dispute-alert?key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: '_test-dispute-no-card',
          amount: 9.99,
          transactionDate: '2026-01-15',
        });

        assert.isError(response, 400, 'Should reject missing card');
      },
    },

    {
      name: 'rejects-missing-amount',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post(`payments/dispute-alert?key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: '_test-dispute-no-amount',
          card: '4242',
          transactionDate: '2026-01-15',
        });

        assert.isError(response, 400, 'Should reject missing amount');
      },
    },

    {
      name: 'rejects-missing-transaction-date',
      auth: 'none',
      async run({ http, assert }) {
        const response = await http.as('none').post(`payments/dispute-alert?key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: '_test-dispute-no-date',
          card: '4242',
          amount: 9.99,
        });

        assert.isError(response, 400, 'Should reject missing transactionDate');
      },
    },

    {
      name: 'accepts-valid-chargeblast-alert',
      auth: 'none',
      async run({ http, assert, firestore }) {
        const alertId = '_test-dispute-valid';

        // Clean up any existing doc
        await firestore.delete(`payments-disputes/${alertId}`);

        const response = await http.as('none').post(`payments/dispute-alert?key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: alertId,
          card: '4242424242424242',
          cardBrand: 'Visa',
          amount: 29.99,
          transactionDate: '2026-03-07 14:30:00',
          processor: 'stripe',
          alertType: 'FRAUD',
          customerEmail: 'test@example.com',
          externalOrder: 'ch_test123',
          metadata: 'pi_test456',
          externalUrl: 'https://dashboard.stripe.com/charges/ch_test123',
          reasonCode: 'WIP',
          subprovider: 'Ethoca',
          isRefunded: false,
        });

        assert.isSuccess(response, 'Should accept valid Chargeblast alert');
        assert.equal(response.data.received, true, 'Should confirm receipt');

        // Verify doc was saved to Firestore
        const doc = await firestore.get(`payments-disputes/${alertId}`);
        assert.ok(doc, 'Dispute doc should exist in Firestore');
        assert.equal(doc.provider, 'chargeblast', 'Provider should be chargeblast');
        assert.ok(
          doc.status === 'pending' || doc.status === 'processing',
          'Status should be pending or processing',
        );

        // Verify core normalized alert data
        assert.equal(doc.alert.card.last4, '4242', 'Should extract last4 from full card number');
        assert.equal(doc.alert.card.brand, 'visa', 'Should lowercase card brand');
        assert.equal(doc.alert.amount, 29.99, 'Amount should be preserved');
        assert.equal(doc.alert.transactionDate, '2026-03-07', 'Should extract date without time');
        assert.equal(doc.alert.processor, 'stripe', 'Processor should be stripe');

        // Verify new normalized fields
        assert.equal(doc.alert.alertType, 'FRAUD', 'Alert type should be preserved');
        assert.equal(doc.alert.customerEmail, 'test@example.com', 'Customer email should be preserved');
        assert.equal(doc.alert.chargeId, 'ch_test123', 'Charge ID should be extracted from externalOrder');
        assert.equal(doc.alert.paymentIntentId, 'pi_test456', 'Payment intent ID should be extracted from metadata');
        assert.equal(doc.alert.stripeUrl, 'https://dashboard.stripe.com/charges/ch_test123', 'Stripe URL should be preserved');
        assert.equal(doc.alert.reasonCode, 'WIP', 'Reason code should be preserved');
        assert.equal(doc.alert.subprovider, 'Ethoca', 'Subprovider should be preserved');
        assert.equal(doc.alert.isRefunded, false, 'isRefunded should be preserved');

        // Verify raw payload is preserved
        assert.ok(doc.raw, 'Raw payload should be preserved');
        assert.equal(doc.raw.id, alertId, 'Raw id should match');

        // Clean up
        await firestore.delete(`payments-disputes/${alertId}`);
      },
    },

    {
      name: 'accepts-alert-with-alertId-field',
      auth: 'none',
      async run({ http, assert, firestore }) {
        const alertId = '_test-dispute-alertid-field';

        // Clean up any existing doc
        await firestore.delete(`payments-disputes/${alertId}`);

        // Chargeblast alert.created events use alertId instead of id
        const response = await http.as('none').post(`payments/dispute-alert?key=${process.env.BACKEND_MANAGER_KEY}`, {
          alertId: alertId,
          card: '546616******5805',
          cardBrand: 'Mastercard',
          amount: 8,
          transactionDate: '2026-03-19 00:00:00.000000Z',
        });

        assert.isSuccess(response, 'Should accept alert using alertId field');

        const doc = await firestore.get(`payments-disputes/${alertId}`);
        assert.ok(doc, 'Dispute doc should exist in Firestore');
        assert.equal(doc.id, alertId, 'Doc ID should match alertId');
        assert.equal(doc.alert.id, alertId, 'Alert id should be set from alertId');
        assert.equal(doc.alert.card.last4, '5805', 'Should extract last4 from masked card');

        // Clean up
        await firestore.delete(`payments-disputes/${alertId}`);
      },
    },

    {
      name: 'accepts-alert-without-optional-fields',
      auth: 'none',
      async run({ http, assert, firestore }) {
        const alertId = '_test-dispute-minimal';

        // Clean up any existing doc
        await firestore.delete(`payments-disputes/${alertId}`);

        // Send minimal alert (alert.created shape — no externalOrder, metadata, etc.)
        const response = await http.as('none').post(`payments/dispute-alert?key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: alertId,
          card: '9124',
          amount: 10,
          transactionDate: '2026-03-21 00:01:02',
        });

        assert.isSuccess(response, 'Should accept minimal alert');

        const doc = await firestore.get(`payments-disputes/${alertId}`);
        assert.equal(doc.alert.card.last4, '9124', 'Should use card as last4');
        assert.equal(doc.alert.processor, 'stripe', 'Processor should default to stripe');
        assert.equal(doc.alert.chargeId, null, 'Charge ID should be null when not provided');
        assert.equal(doc.alert.paymentIntentId, null, 'Payment intent should be null when not provided');
        assert.equal(doc.alert.customerEmail, null, 'Customer email should be null when not provided');
        assert.equal(doc.alert.alertType, null, 'Alert type should be null when not provided');
        assert.equal(doc.alert.stripeUrl, null, 'Stripe URL should be null when not provided');
        assert.equal(doc.alert.reasonCode, null, 'Reason code should be null when not provided');
        assert.equal(doc.alert.subprovider, null, 'Subprovider should be null when not provided');
        assert.equal(doc.alert.isRefunded, false, 'isRefunded should default to false');

        // Clean up
        await firestore.delete(`payments-disputes/${alertId}`);
      },
    },

    {
      name: 'accepts-alert-with-last4-only',
      auth: 'none',
      async run({ http, assert, firestore }) {
        const alertId = '_test-dispute-last4';

        // Clean up any existing doc
        await firestore.delete(`payments-disputes/${alertId}`);

        const response = await http.as('none').post(`payments/dispute-alert?key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: alertId,
          card: '1234',
          amount: 9.99,
          transactionDate: '2026-01-15',
        });

        assert.isSuccess(response, 'Should accept alert with card last4 only');

        const doc = await firestore.get(`payments-disputes/${alertId}`);
        assert.equal(doc.alert.card.last4, '1234', 'Should use card value as last4 when already 4 digits');
        assert.equal(doc.alert.processor, 'stripe', 'Processor should default to stripe');

        // Clean up
        await firestore.delete(`payments-disputes/${alertId}`);
      },
    },

    {
      name: 'deduplicates-dispute-alerts',
      auth: 'none',
      async run({ http, assert, firestore }) {
        const alertId = '_test-dispute-duplicate';

        // Clean up any existing doc
        await firestore.delete(`payments-disputes/${alertId}`);

        // Send first alert
        await http.as('none').post(`payments/dispute-alert?key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: alertId,
          card: '4242',
          amount: 29.99,
          transactionDate: '2026-03-07',
        });

        // Send duplicate
        const response = await http.as('none').post(`payments/dispute-alert?key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: alertId,
          card: '4242',
          amount: 29.99,
          transactionDate: '2026-03-07',
        });

        assert.isSuccess(response, 'Duplicate should still return 200');
        assert.equal(response.data.duplicate, true, 'Should indicate duplicate');

        // Clean up
        await firestore.delete(`payments-disputes/${alertId}`);
      },
    },

    {
      name: 'retries-failed-alerts',
      auth: 'none',
      async run({ http, assert, firestore }) {
        const alertId = '_test-dispute-retry';

        // Pre-seed a failed dispute
        await firestore.set(`payments-disputes/${alertId}`, {
          id: alertId,
          status: 'failed',
          error: 'Previous error',
        });

        // Send alert with same ID — should retry since previous status was 'failed'
        const response = await http.as('none').post(`payments/dispute-alert?key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: alertId,
          card: '4242',
          amount: 29.99,
          transactionDate: '2026-03-07',
        });

        assert.isSuccess(response, 'Should accept retry of failed alert');
        assert.ok(!response.data.duplicate, 'Should not indicate duplicate for failed retry');

        // Verify doc was updated
        const doc = await firestore.get(`payments-disputes/${alertId}`);
        assert.ok(
          doc.status === 'pending' || doc.status === 'processing',
          'Status should be pending or processing after retry',
        );

        // Clean up
        await firestore.delete(`payments-disputes/${alertId}`);
      },
    },

    {
      name: 'defaults-provider-to-chargeblast',
      auth: 'none',
      async run({ http, assert, firestore }) {
        const alertId = '_test-dispute-default-provider';

        // Clean up any existing doc
        await firestore.delete(`payments-disputes/${alertId}`);

        // Send without provider query param
        const response = await http.as('none').post(`payments/dispute-alert?key=${process.env.BACKEND_MANAGER_KEY}`, {
          id: alertId,
          card: '4242',
          amount: 9.99,
          transactionDate: '2026-01-15',
        });

        assert.isSuccess(response, 'Should accept without explicit provider param');

        const doc = await firestore.get(`payments-disputes/${alertId}`);
        assert.equal(doc.provider, 'chargeblast', 'Provider should default to chargeblast');

        // Clean up
        await firestore.delete(`payments-disputes/${alertId}`);
      },
    },
  ],
};
