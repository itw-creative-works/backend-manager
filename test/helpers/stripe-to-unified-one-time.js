/**
 * Test: Stripe toUnifiedOneTime()
 * Unit tests for the Stripe library's raw resource → unified one-time payment transformation
 *
 * Tests the pure function directly — no emulator, no Firestore, no HTTP
 */
const Stripe = require('../../src/manager/libraries/payment-processors/stripe.js');

// Real Stripe CLI fixtures (generated via `stripe trigger`)
const FIXTURE_SESSION = require('../fixtures/stripe/checkout-session-completed.json');
const FIXTURE_INVOICE_FAILED = require('../fixtures/stripe/invoice-payment-failed.json');

// Mock config matching the BEM template
const MOCK_CONFIG = {
  payment: {
    products: [
      { id: 'basic', name: 'Basic', type: 'subscription', limits: { requests: 100 } },
      {
        id: 'credits-100', name: '100 Credits', type: 'one-time',
        prices: { once: { amount: 9.99, stripe: 'price_credits_100' } },
      },
      {
        id: 'credits-500', name: '500 Credits', type: 'one-time',
        prices: { once: { amount: 39.99, stripe: 'price_credits_500' } },
      },
    ],
  },
};

function toUnifiedOneTime(rawResource, options) {
  return Stripe.toUnifiedOneTime(rawResource, { config: MOCK_CONFIG, ...options });
}

module.exports = {
  description: 'Stripe toUnifiedOneTime() transformation',
  type: 'group',

  tests: [
    // ─── Status passthrough ───

    {
      name: 'status-complete',
      async run({ assert }) {
        const result = toUnifiedOneTime({ status: 'complete' });
        assert.equal(result.status, 'complete', 'Status passes through as-is');
      },
    },

    {
      name: 'status-open',
      async run({ assert }) {
        const result = toUnifiedOneTime({ status: 'open' });
        assert.equal(result.status, 'open', 'Status passes through as-is');
      },
    },

    {
      name: 'status-unknown-when-missing',
      async run({ assert }) {
        const result = toUnifiedOneTime({});
        assert.equal(result.status, 'unknown', 'Missing status → unknown');
      },
    },

    // ─── Product resolution ───

    {
      name: 'product-resolves-from-metadata-product-id',
      async run({ assert }) {
        const result = toUnifiedOneTime({ metadata: { productId: 'credits-100' } });
        assert.equal(result.product.id, 'credits-100', 'Should resolve from metadata.productId');
        assert.equal(result.product.name, '100 Credits', 'Should have correct name');
      },
    },

    {
      name: 'product-resolves-second-product',
      async run({ assert }) {
        const result = toUnifiedOneTime({ metadata: { productId: 'credits-500' } });
        assert.equal(result.product.id, 'credits-500', 'Should resolve credits-500');
        assert.equal(result.product.name, '500 Credits', 'Should have correct name');
      },
    },

    {
      name: 'product-falls-back-to-unknown-on-missing-metadata',
      async run({ assert }) {
        const result = toUnifiedOneTime({});
        assert.equal(result.product.id, 'unknown', 'No metadata → unknown');
        assert.equal(result.product.name, 'Unknown', 'No metadata → Unknown name');
      },
    },

    {
      name: 'product-falls-back-to-product-id-on-unknown-product',
      async run({ assert }) {
        const result = toUnifiedOneTime({ metadata: { productId: 'nonexistent-product' } });
        assert.equal(result.product.id, 'nonexistent-product', 'Unknown product → uses ID as-is');
      },
    },

    {
      name: 'product-without-config',
      async run({ assert }) {
        const result = Stripe.toUnifiedOneTime({ metadata: { productId: 'credits-100' } }, {});
        assert.equal(result.product.id, 'credits-100', 'Without config → uses metadata ID');
        // resolveProductOneTime returns { name: 'Unknown' } when config has no products array
        assert.equal(result.product.name, 'Unknown', 'Without config → Unknown name');
      },
    },

    // ─── Payment metadata ───

    {
      name: 'payment-processor-always-stripe',
      async run({ assert }) {
        const result = toUnifiedOneTime({});
        assert.equal(result.payment.processor, 'stripe', 'Processor should always be stripe');
      },
    },

    {
      name: 'payment-resource-id-from-session-id',
      async run({ assert }) {
        const result = toUnifiedOneTime({ id: 'cs_test_abc123' });
        assert.equal(result.payment.resourceId, 'cs_test_abc123', 'resourceId should be session/invoice ID');
      },
    },

    {
      name: 'payment-resource-id-null-when-missing',
      async run({ assert }) {
        const result = toUnifiedOneTime({});
        assert.equal(result.payment.resourceId, null, 'Missing ID → null resourceId');
      },
    },

    {
      name: 'payment-order-id-from-metadata',
      async run({ assert }) {
        const result = toUnifiedOneTime({ metadata: { orderId: '1234-5678-9012' } });
        assert.equal(result.payment.orderId, '1234-5678-9012', 'orderId should come from metadata');
      },
    },

    {
      name: 'payment-order-id-null-when-missing',
      async run({ assert }) {
        const result = toUnifiedOneTime({});
        assert.equal(result.payment.orderId, null, 'Missing metadata → null orderId');
      },
    },

    {
      name: 'payment-price-resolves-from-config',
      async run({ assert }) {
        const result = toUnifiedOneTime({ metadata: { productId: 'credits-100' } });
        assert.equal(result.payment.price, 9.99, 'Should resolve price from config');
      },
    },

    {
      name: 'payment-price-zero-on-unknown-product',
      async run({ assert }) {
        const result = toUnifiedOneTime({ metadata: { productId: 'nonexistent' } });
        assert.equal(result.payment.price, 0, 'Unknown product → price 0');
      },
    },

    {
      name: 'payment-price-zero-when-no-metadata',
      async run({ assert }) {
        const result = toUnifiedOneTime({});
        assert.equal(result.payment.price, 0, 'No metadata → price 0');
      },
    },

    {
      name: 'payment-event-metadata-passed-through',
      async run({ assert }) {
        const result = toUnifiedOneTime({}, { eventName: 'checkout.session.completed', eventId: 'evt_123' });
        assert.equal(result.payment.updatedBy.event.name, 'checkout.session.completed', 'Event name passed through');
        assert.equal(result.payment.updatedBy.event.id, 'evt_123', 'Event ID passed through');
      },
    },

    {
      name: 'payment-event-metadata-null-when-missing',
      async run({ assert }) {
        const result = toUnifiedOneTime({});
        assert.equal(result.payment.updatedBy.event.name, null, 'Missing event name → null');
        assert.equal(result.payment.updatedBy.event.id, null, 'Missing event ID → null');
      },
    },

    // ─── Full unified shape ───

    {
      name: 'full-session-shape',
      async run({ assert }) {
        const result = toUnifiedOneTime({
          id: 'cs_test_full',
          status: 'complete',
          metadata: { orderId: '1234-5678-9012', productId: 'credits-100' },
        }, { eventName: 'checkout.session.completed', eventId: 'evt_full' });

        assert.ok(result.product, 'Should have product');
        assert.ok(result.status, 'Should have status');
        assert.ok(result.payment, 'Should have payment');

        assert.equal(result.product.id, 'credits-100', 'Product should be credits-100');
        assert.equal(result.status, 'complete', 'Status should be complete');
        assert.equal(result.payment.processor, 'stripe', 'Processor should be stripe');
        assert.equal(result.payment.resourceId, 'cs_test_full', 'Resource ID should match');
        assert.equal(result.payment.orderId, '1234-5678-9012', 'orderId should match');
        assert.equal(result.payment.price, 9.99, 'Price should be resolved');
        assert.equal(result.payment.updatedBy.event.name, 'checkout.session.completed', 'Event name should match');
      },
    },

    {
      name: 'empty-input-gets-safe-defaults',
      async run({ assert }) {
        const result = toUnifiedOneTime({});

        assert.equal(result.product.id, 'unknown', 'Empty → unknown product');
        assert.equal(result.status, 'unknown', 'Empty → unknown status');
        assert.equal(result.payment.processor, 'stripe', 'Empty → still stripe');
        assert.equal(result.payment.orderId, null, 'Empty → null orderId');
        assert.equal(result.payment.resourceId, null, 'Empty → null resourceId');
        assert.equal(result.payment.price, 0, 'Empty → price 0');
      },
    },

    {
      name: 'no-expires-or-trial-on-one-time',
      async run({ assert }) {
        const result = toUnifiedOneTime({ id: 'cs_test_shape' });
        // One-time payments do not have subscription-specific fields
        assert.equal(result.expires, undefined, 'No expires on one-time');
        assert.equal(result.trial, undefined, 'No trial on one-time');
        assert.equal(result.cancellation, undefined, 'No cancellation on one-time');
      },
    },

    // ─── Real Stripe fixtures ───

    {
      name: 'fixture-session-completed-shape',
      async run({ assert }) {
        const result = toUnifiedOneTime(FIXTURE_SESSION);

        assert.ok(result.product, 'Should have product');
        assert.equal(result.status, 'complete', 'Real session fixture → complete');
        assert.equal(result.payment.processor, 'stripe', 'Processor is stripe');
        assert.equal(result.payment.resourceId, FIXTURE_SESSION.id, 'resourceId matches fixture ID');
      },
    },

    {
      name: 'fixture-session-completed-no-subscription-fields',
      async run({ assert }) {
        const result = toUnifiedOneTime(FIXTURE_SESSION);
        assert.equal(result.expires, undefined, 'Session fixture has no expires');
        assert.equal(result.trial, undefined, 'Session fixture has no trial');
        assert.equal(result.cancellation, undefined, 'Session fixture has no cancellation');
      },
    },

    {
      name: 'fixture-invoice-failed-shape',
      async run({ assert }) {
        const result = toUnifiedOneTime(FIXTURE_INVOICE_FAILED);

        assert.ok(result.product, 'Should have product');
        assert.equal(result.status, 'open', 'Failed invoice fixture → open');
        assert.equal(result.payment.processor, 'stripe', 'Processor is stripe');
        assert.equal(result.payment.resourceId, FIXTURE_INVOICE_FAILED.id, 'resourceId matches fixture ID');
      },
    },

    {
      name: 'fixture-all-have-unified-shape',
      async run({ assert }) {
        const fixtures = [FIXTURE_SESSION, FIXTURE_INVOICE_FAILED];
        const names = ['session-completed', 'invoice-failed'];

        for (let i = 0; i < fixtures.length; i++) {
          const result = toUnifiedOneTime(fixtures[i]);
          const label = names[i];

          assert.ok(result.product, `${label}: should have product`);
          assert.ok(result.product.id, `${label}: should have product.id`);
          assert.ok(result.product.name, `${label}: should have product.name`);
          assert.isType(result.status, 'string', `${label}: status should be string`);
          assert.ok(result.payment, `${label}: should have payment`);
          assert.equal(result.payment.processor, 'stripe', `${label}: processor should be stripe`);
          assert.ok(result.payment.updatedBy, `${label}: should have updatedBy`);
          assert.ok(result.payment.updatedBy.date, `${label}: should have updatedBy.date`);
        }
      },
    },
  ],
};
