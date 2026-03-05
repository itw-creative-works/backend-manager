/**
 * Test: PayPal toUnifiedOneTime()
 * Unit tests for the PayPal library's raw resource → unified one-time payment transformation
 *
 * Tests the pure function directly — no emulator, no Firestore, no HTTP
 * Mirrors stripe/to-unified-one-time.js for consistent coverage
 */
const PayPal = require('../../../../src/manager/libraries/payment/processors/paypal.js');

// Real PayPal sandbox fixtures
const FIXTURE_ORDER_APPROVED = require('../../../fixtures/paypal/order-approved.json');
const FIXTURE_ORDER_COMPLETED = require('../../../fixtures/paypal/order-completed.json');

// Mock config matching the BEM template (new flat price structure)
const MOCK_CONFIG = {
  payment: {
    products: [
      { id: 'basic', name: 'Basic', type: 'subscription', limits: { requests: 100 } },
      {
        id: 'credits-100', name: '100 Credits', type: 'one-time',
        prices: { once: 9.99 },
        paypal: { productId: 'PROD-credits-100' },
      },
      {
        id: 'credits-500', name: '500 Credits', type: 'one-time',
        prices: { once: 39.99 },
        paypal: { productId: 'PROD-credits-500' },
      },
    ],
  },
};

function toUnifiedOneTime(rawResource, options) {
  return PayPal.toUnifiedOneTime(rawResource, { config: MOCK_CONFIG, ...options });
}

module.exports = {
  description: 'PayPal toUnifiedOneTime() transformation',
  type: 'group',

  tests: [
    // ─── Status mapping ───

    {
      name: 'status-completed',
      async run({ assert }) {
        const result = toUnifiedOneTime({ status: 'COMPLETED' });
        assert.equal(result.status, 'completed', 'PayPal COMPLETED → unified completed');
      },
    },

    {
      name: 'status-created-lowercased',
      async run({ assert }) {
        const result = toUnifiedOneTime({ status: 'CREATED' });
        assert.equal(result.status, 'created', 'PayPal CREATED → lowercase created');
      },
    },

    {
      name: 'status-approved-lowercased',
      async run({ assert }) {
        const result = toUnifiedOneTime({ status: 'APPROVED' });
        assert.equal(result.status, 'approved', 'PayPal APPROVED → lowercase approved');
      },
    },

    {
      name: 'status-voided-lowercased',
      async run({ assert }) {
        const result = toUnifiedOneTime({ status: 'VOIDED' });
        assert.equal(result.status, 'voided', 'PayPal VOIDED → lowercase voided');
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
      name: 'product-resolves-from-custom-id-product-id',
      async run({ assert }) {
        const result = toUnifiedOneTime({ custom_id: 'uid:user1,orderId:ord1,productId:credits-100' });
        assert.equal(result.product.id, 'credits-100', 'Should resolve from custom_id productId');
        assert.equal(result.product.name, '100 Credits', 'Should have correct name');
      },
    },

    {
      name: 'product-resolves-second-product',
      async run({ assert }) {
        const result = toUnifiedOneTime({ custom_id: 'uid:user1,productId:credits-500' });
        assert.equal(result.product.id, 'credits-500', 'Should resolve credits-500');
        assert.equal(result.product.name, '500 Credits', 'Should have correct name');
      },
    },

    {
      name: 'product-resolves-from-purchase-units-structured',
      async run({ assert }) {
        const result = toUnifiedOneTime({
          purchase_units: [{ custom_id: 'uid:user1,orderId:ord1,productId:credits-100' }],
        });
        assert.equal(result.product.id, 'credits-100', 'Should resolve from purchase_units structured custom_id');
        assert.equal(result.product.name, '100 Credits', 'Should have correct name');
      },
    },

    {
      name: 'product-purchase-units-takes-priority-over-top-level',
      async run({ assert }) {
        const result = toUnifiedOneTime({
          custom_id: 'productId:credits-500',
          purchase_units: [{ custom_id: 'uid:user1,productId:credits-100' }],
        });
        assert.equal(result.product.id, 'credits-100', 'purchase_units custom_id takes priority over top-level');
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
        const result = toUnifiedOneTime({ custom_id: 'productId:nonexistent-product' });
        assert.equal(result.product.id, 'nonexistent-product', 'Unknown product → uses ID as-is');
        assert.equal(result.product.name, 'nonexistent-product', 'Unknown product → ID as name');
      },
    },

    {
      name: 'product-without-config',
      async run({ assert }) {
        const result = PayPal.toUnifiedOneTime({ custom_id: 'productId:credits-100' }, {});
        assert.equal(result.product.id, 'credits-100', 'Without config → uses productId');
        assert.equal(result.product.name, 'Unknown', 'Without config → Unknown name');
      },
    },

    // ─── Payment metadata ───

    {
      name: 'payment-processor-always-paypal',
      async run({ assert }) {
        const result = toUnifiedOneTime({});
        assert.equal(result.payment.processor, 'paypal', 'Processor should always be paypal');
      },
    },

    {
      name: 'payment-resource-id-from-resource-id',
      async run({ assert }) {
        const result = toUnifiedOneTime({ id: 'PAYID-ABC123' });
        assert.equal(result.payment.resourceId, 'PAYID-ABC123', 'resourceId should be PayPal resource ID');
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
      name: 'payment-order-id-from-custom-id',
      async run({ assert }) {
        const result = toUnifiedOneTime({ custom_id: 'uid:user1,orderId:1234-5678-9012' });
        assert.equal(result.payment.orderId, '1234-5678-9012', 'orderId should come from custom_id');
      },
    },

    {
      name: 'payment-order-id-null-when-missing',
      async run({ assert }) {
        const result = toUnifiedOneTime({});
        assert.equal(result.payment.orderId, null, 'Missing custom_id → null orderId');
      },
    },

    {
      name: 'payment-price-resolves-from-config',
      async run({ assert }) {
        const result = toUnifiedOneTime({ custom_id: 'productId:credits-100' });
        assert.equal(result.payment.price, 9.99, 'Should resolve price from config');
      },
    },

    {
      name: 'payment-price-zero-on-unknown-product',
      async run({ assert }) {
        const result = toUnifiedOneTime({ custom_id: 'productId:nonexistent' });
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
        const result = toUnifiedOneTime({}, { eventName: 'CHECKOUT.ORDER.APPROVED', eventId: 'WH-123' });
        assert.equal(result.payment.updatedBy.event.name, 'CHECKOUT.ORDER.APPROVED', 'Event name passed through');
        assert.equal(result.payment.updatedBy.event.id, 'WH-123', 'Event ID passed through');
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
      name: 'full-completed-shape',
      async run({ assert }) {
        const result = toUnifiedOneTime({
          id: 'PAYID-FULL',
          status: 'COMPLETED',
          custom_id: 'uid:user1,orderId:1234-5678-9012,productId:credits-100',
        }, { eventName: 'CHECKOUT.ORDER.APPROVED', eventId: 'WH-FULL' });

        assert.ok(result.product, 'Should have product');
        assert.ok(result.status, 'Should have status');
        assert.ok(result.payment, 'Should have payment');

        assert.equal(result.product.id, 'credits-100', 'Product should be credits-100');
        assert.equal(result.status, 'completed', 'Status should be completed');
        assert.equal(result.payment.processor, 'paypal', 'Processor should be paypal');
        assert.equal(result.payment.resourceId, 'PAYID-FULL', 'Resource ID should match');
        assert.equal(result.payment.orderId, '1234-5678-9012', 'orderId should match');
        assert.equal(result.payment.price, 9.99, 'Price should be resolved');
        assert.equal(result.payment.updatedBy.event.name, 'CHECKOUT.ORDER.APPROVED', 'Event name should match');
      },
    },

    {
      name: 'empty-input-gets-safe-defaults',
      async run({ assert }) {
        const result = toUnifiedOneTime({});

        assert.equal(result.product.id, 'unknown', 'Empty → unknown product');
        assert.equal(result.status, 'unknown', 'Empty → unknown status');
        assert.equal(result.payment.processor, 'paypal', 'Empty → still paypal');
        assert.equal(result.payment.orderId, null, 'Empty → null orderId');
        assert.equal(result.payment.resourceId, null, 'Empty → null resourceId');
        assert.equal(result.payment.price, 0, 'Empty → price 0');
      },
    },

    {
      name: 'no-expires-or-trial-on-one-time',
      async run({ assert }) {
        const result = toUnifiedOneTime({ id: 'PAYID-SHAPE' });
        // One-time payments do not have subscription-specific fields
        assert.equal(result.expires, undefined, 'No expires on one-time');
        assert.equal(result.trial, undefined, 'No trial on one-time');
        assert.equal(result.cancellation, undefined, 'No cancellation on one-time');
      },
    },

    // ─── Custom ID parsing edge cases ───

    {
      name: 'custom-id-with-colon-in-values',
      async run({ assert }) {
        const result = toUnifiedOneTime({
          custom_id: 'uid:firebase:auth:user123,orderId:ord-c,productId:credits-100',
        });
        assert.equal(result.payment.orderId, 'ord-c', 'orderId parsed correctly');
        assert.equal(result.product.id, 'credits-100', 'productId parsed correctly');
      },
    },

    {
      name: 'custom-id-product-id-only',
      async run({ assert }) {
        const result = toUnifiedOneTime({
          custom_id: 'productId:credits-500',
        });
        assert.equal(result.product.id, 'credits-500', 'Should parse productId without uid/orderId');
        assert.equal(result.payment.orderId, null, 'No orderId → null');
      },
    },

    {
      name: 'custom-id-empty-string',
      async run({ assert }) {
        const result = toUnifiedOneTime({ custom_id: '' });
        assert.equal(result.product.id, 'unknown', 'Empty custom_id → unknown product');
        assert.equal(result.payment.orderId, null, 'Empty custom_id → null orderId');
      },
    },

    // ─── updatedBy.date shape ───

    {
      name: 'updated-by-date-has-both-formats',
      async run({ assert }) {
        const result = toUnifiedOneTime({});
        assert.ok(result.payment.updatedBy.date, 'Should have updatedBy.date');
        assert.isType(result.payment.updatedBy.date.timestamp, 'string', 'timestamp should be string');
        assert.isType(result.payment.updatedBy.date.timestampUNIX, 'number', 'timestampUNIX should be number');
      },
    },

    // ─── Real PayPal sandbox fixtures ───

    {
      name: 'fixture-order-completed-produces-valid-shape',
      async run({ assert }) {
        const result = toUnifiedOneTime(FIXTURE_ORDER_COMPLETED);

        assert.equal(result.status, 'completed', 'COMPLETED fixture → completed');
        assert.equal(result.payment.processor, 'paypal', 'Processor is paypal');
        assert.equal(result.payment.resourceId, '5UX02069M9686893E', 'Resource ID from fixture');
        assert.equal(result.payment.orderId, 'ord-test-456', 'orderId from purchase_units custom_id');
        assert.equal(result.product.id, 'credits-100', 'Product resolved from purchase_units custom_id');
        assert.equal(result.product.name, '100 Credits', 'Product name from config');
        assert.equal(result.payment.price, 9.99, 'Price from config');
      },
    },

    {
      name: 'fixture-order-approved-produces-valid-shape',
      async run({ assert }) {
        const result = toUnifiedOneTime(FIXTURE_ORDER_APPROVED);

        assert.equal(result.status, 'approved', 'APPROVED fixture → approved');
        assert.equal(result.payment.resourceId, '5UX02069M9686893E', 'Resource ID from fixture');
        assert.equal(result.product.id, 'credits-100', 'Product resolved from purchase_units custom_id');
        assert.equal(result.payment.orderId, 'ord-test-456', 'orderId from purchase_units custom_id');
      },
    },

    {
      name: 'fixture-all-orders-produce-valid-unified-keys',
      async run({ assert }) {
        const fixtures = [FIXTURE_ORDER_APPROVED, FIXTURE_ORDER_COMPLETED];

        for (let i = 0; i < fixtures.length; i++) {
          const result = toUnifiedOneTime(fixtures[i]);
          assert.ok(result.product, `Fixture ${i}: should have product`);
          assert.ok(result.status, `Fixture ${i}: should have status`);
          assert.ok(result.payment, `Fixture ${i}: should have payment`);
          assert.equal(result.payment.processor, 'paypal', `Fixture ${i}: processor is paypal`);
          assert.isType(result.payment.updatedBy.date.timestamp, 'string', `Fixture ${i}: updatedBy.date.timestamp is string`);
          assert.isType(result.payment.updatedBy.date.timestampUNIX, 'number', `Fixture ${i}: updatedBy.date.timestampUNIX is number`);
          // One-time payments should NOT have subscription fields
          assert.equal(result.expires, undefined, `Fixture ${i}: no expires`);
          assert.equal(result.trial, undefined, `Fixture ${i}: no trial`);
          assert.equal(result.cancellation, undefined, `Fixture ${i}: no cancellation`);
        }
      },
    },
  ],
};
