/**
 * Test: PayPal toUnifiedSubscription()
 * Unit tests for the PayPal library's raw subscription → unified subscription transformation
 *
 * Tests the pure function directly — no emulator, no Firestore, no HTTP
 * Mirrors stripe/to-unified-subscription.js for consistent coverage
 */
const PayPal = require('../../../../src/manager/libraries/payment/processors/paypal.js');

// Real PayPal sandbox fixtures
const FIXTURE_ACTIVE = require('../../../fixtures/paypal/subscription-active.json');
const FIXTURE_CANCELLED = require('../../../fixtures/paypal/subscription-cancelled.json');
const FIXTURE_SUSPENDED = require('../../../fixtures/paypal/subscription-suspended.json');

// Mock config matching the BEM template (new flat price structure)
const MOCK_CONFIG = {
  payment: {
    products: [
      { id: 'basic', name: 'Basic', type: 'subscription', limits: { requests: 100 } },
      {
        id: 'plus', name: 'Plus', type: 'subscription',
        prices: { monthly: 9.99, annually: 99.99 },
        paypal: { productId: 'PROD-plus' },
      },
      {
        id: 'pro', name: 'Pro', type: 'subscription',
        prices: { monthly: 29.99, annually: 299.99 },
        paypal: { productId: 'PROD-pro' },
      },
    ],
  },
};

function toUnifiedSubscription(rawSubscription, options) {
  return PayPal.toUnifiedSubscription(rawSubscription, { config: MOCK_CONFIG, ...options });
}

module.exports = {
  description: 'PayPal toUnifiedSubscription() transformation',
  type: 'group',

  tests: [
    // ─── Status mapping ───

    {
      name: 'status-active',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'ACTIVE' });
        assert.equal(result.status, 'active', 'PayPal ACTIVE → unified active');
      },
    },

    {
      name: 'status-approved',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'APPROVED' });
        assert.equal(result.status, 'active', 'PayPal APPROVED → unified active');
      },
    },

    {
      name: 'status-suspended',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'SUSPENDED' });
        assert.equal(result.status, 'suspended', 'PayPal SUSPENDED → unified suspended');
      },
    },

    {
      name: 'status-cancelled',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'CANCELLED' });
        assert.equal(result.status, 'cancelled', 'PayPal CANCELLED → unified cancelled');
      },
    },

    {
      name: 'status-expired',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'EXPIRED' });
        assert.equal(result.status, 'cancelled', 'PayPal EXPIRED → unified cancelled');
      },
    },

    {
      name: 'status-approval-pending',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'APPROVAL_PENDING' });
        assert.equal(result.status, 'cancelled', 'PayPal APPROVAL_PENDING → unified cancelled');
      },
    },

    {
      name: 'status-unknown-defaults-to-cancelled',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'SOME_FUTURE_STATUS' });
        assert.equal(result.status, 'cancelled', 'Unknown status → cancelled');
      },
    },

    // ─── Product resolution ───

    {
      name: 'product-resolves-from-plan-product-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: { product_id: 'PROD-plus' },
        });
        assert.equal(result.product.id, 'plus', 'Should resolve to plus');
        assert.equal(result.product.name, 'Plus', 'Should have correct name');
      },
    },

    {
      name: 'product-resolves-pro-from-plan-product-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: { product_id: 'PROD-pro' },
        });
        assert.equal(result.product.id, 'pro', 'Should resolve to pro');
        assert.equal(result.product.name, 'Pro', 'Should have correct name');
      },
    },

    {
      name: 'product-falls-back-to-basic-on-unknown-product',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: { product_id: 'PROD-nonexistent' },
        });
        assert.equal(result.product.id, 'basic', 'Unknown product → basic');
        assert.equal(result.product.name, 'Basic', 'Unknown product → Basic name');
      },
    },

    {
      name: 'product-falls-back-to-basic-on-missing-plan',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.product.id, 'basic', 'No _plan → basic');
      },
    },

    {
      name: 'product-falls-back-to-basic-without-config',
      async run({ assert }) {
        const result = PayPal.toUnifiedSubscription(
          { _plan: { product_id: 'PROD-plus' } },
          {},
        );
        assert.equal(result.product.id, 'basic', 'No config → basic');
      },
    },

    // ─── Frequency resolution ───

    {
      name: 'frequency-month-from-plan',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: {
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'MONTH', interval_count: 1 } },
            ],
          },
        });
        assert.equal(result.payment.frequency, 'monthly', 'MONTH → monthly');
      },
    },

    {
      name: 'frequency-year-from-plan',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: {
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'YEAR', interval_count: 1 } },
            ],
          },
        });
        assert.equal(result.payment.frequency, 'annually', 'YEAR → annually');
      },
    },

    {
      name: 'frequency-week-from-plan',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: {
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'WEEK', interval_count: 1 } },
            ],
          },
        });
        assert.equal(result.payment.frequency, 'weekly', 'WEEK → weekly');
      },
    },

    {
      name: 'frequency-day-from-plan',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: {
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'DAY', interval_count: 1 } },
            ],
          },
        });
        assert.equal(result.payment.frequency, 'daily', 'DAY → daily');
      },
    },

    {
      name: 'frequency-null-when-missing',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.payment.frequency, null, 'Missing plan → null');
      },
    },

    {
      name: 'frequency-from-inline-plan',
      async run({ assert }) {
        // PayPal ?fields=plan returns plan inline
        const result = toUnifiedSubscription({
          plan: {
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'YEAR', interval_count: 1 } },
            ],
          },
        });
        assert.equal(result.payment.frequency, 'annually', 'Inline plan year → annually');
      },
    },

    {
      name: 'frequency-prefers-plan-over-inline',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: {
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'MONTH', interval_count: 1 } },
            ],
          },
          plan: {
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'YEAR', interval_count: 1 } },
            ],
          },
        });
        assert.equal(result.payment.frequency, 'monthly', '_plan takes priority over inline plan');
      },
    },

    // ─── Trial resolution ───

    {
      name: 'trial-claimed-when-plan-has-trial-cycle',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          start_time: '2024-01-01T00:00:00Z',
          _plan: {
            billing_cycles: [
              {
                tenure_type: 'TRIAL',
                frequency: { interval_unit: 'DAY', interval_count: 1 },
                total_cycles: 14,
              },
              {
                tenure_type: 'REGULAR',
                frequency: { interval_unit: 'MONTH', interval_count: 1 },
              },
            ],
          },
        });
        assert.equal(result.trial.claimed, true, 'Plan with trial cycle → claimed');
        assert.ok(result.trial.expires.timestampUNIX > 0, 'Trial expires should be set');
      },
    },

    {
      name: 'trial-not-claimed-when-no-trial-cycle',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: {
            billing_cycles: [
              {
                tenure_type: 'REGULAR',
                frequency: { interval_unit: 'MONTH', interval_count: 1 },
              },
            ],
          },
        });
        assert.equal(result.trial.claimed, false, 'No trial cycle → not claimed');
      },
    },

    {
      name: 'trial-not-claimed-when-no-plan',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.trial.claimed, false, 'No plan → not claimed');
      },
    },

    {
      name: 'trial-claimed-with-no-start-time-has-epoch-expiry',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: {
            billing_cycles: [
              {
                tenure_type: 'TRIAL',
                frequency: { interval_unit: 'DAY', interval_count: 1 },
                total_cycles: 7,
              },
            ],
          },
        });
        assert.equal(result.trial.claimed, true, 'Trial cycle exists → claimed');
        assert.equal(result.trial.expires.timestampUNIX, 0, 'No start_time → epoch expiry');
      },
    },

    {
      name: 'trial-month-based-cycle',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          start_time: '2024-01-01T00:00:00Z',
          _plan: {
            billing_cycles: [
              {
                tenure_type: 'TRIAL',
                frequency: { interval_unit: 'MONTH', interval_count: 1 },
                total_cycles: 1,
              },
            ],
          },
        });
        assert.equal(result.trial.claimed, true, 'Monthly trial → claimed');
        assert.ok(result.trial.expires.timestampUNIX > 0, 'Should have computed trial end');
      },
    },

    // ─── Cancellation resolution ───

    {
      name: 'cancellation-when-status-cancelled',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          status: 'CANCELLED',
          status_update_time: '2024-06-15T12:00:00Z',
        });
        assert.equal(result.cancellation.pending, false, 'Already cancelled → not pending');
        assert.ok(result.cancellation.date.timestampUNIX > 0, 'Should have cancellation date');
      },
    },

    {
      name: 'cancellation-cancelled-no-update-time',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          status: 'CANCELLED',
        });
        assert.equal(result.cancellation.pending, false, 'Already cancelled → not pending');
        assert.equal(result.cancellation.date.timestampUNIX, 0, 'No update time → epoch');
      },
    },

    {
      name: 'cancellation-none-when-active',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          status: 'ACTIVE',
        });
        assert.equal(result.cancellation.pending, false, 'Active → not pending');
        assert.equal(result.cancellation.date.timestampUNIX, 0, 'No cancellation date');
      },
    },

    // ─── Expiration resolution ───

    {
      name: 'expires-from-next-billing-time',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          billing_info: { next_billing_time: '2024-07-01T00:00:00Z' },
        });
        assert.ok(result.expires.timestampUNIX > 0, 'Should have expiration');
      },
    },

    {
      name: 'expires-defaults-to-epoch-when-missing',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.expires.timestampUNIX, 0, 'Missing billing_info → epoch');
      },
    },

    // ─── Start date resolution ───

    {
      name: 'start-date-from-start-time',
      async run({ assert }) {
        const result = toUnifiedSubscription({ start_time: '2024-01-15T00:00:00Z' });
        assert.ok(result.payment.startDate.timestampUNIX > 0, 'Should have start date from start_time');
      },
    },

    {
      name: 'start-date-from-create-time-fallback',
      async run({ assert }) {
        const result = toUnifiedSubscription({ create_time: '2024-01-10T00:00:00Z' });
        assert.ok(result.payment.startDate.timestampUNIX > 0, 'Should have start date from create_time');
      },
    },

    {
      name: 'start-date-defaults-to-epoch-when-missing',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.payment.startDate.timestampUNIX, 0, 'Missing start_time → epoch');
      },
    },

    // ─── Payment metadata ───

    {
      name: 'payment-processor-always-paypal',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.payment.processor, 'paypal', 'Processor should always be paypal');
      },
    },

    {
      name: 'payment-resource-id-from-subscription-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({ id: 'I-ABC123' });
        assert.equal(result.payment.resourceId, 'I-ABC123', 'resourceId should be subscription ID');
      },
    },

    {
      name: 'payment-resource-id-null-when-missing',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.payment.resourceId, null, 'Missing ID → null resourceId');
      },
    },

    {
      name: 'payment-order-id-from-custom-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({ custom_id: 'uid:user-abc,orderId:1234-5678' });
        assert.equal(result.payment.orderId, '1234-5678', 'orderId should come from custom_id');
      },
    },

    {
      name: 'payment-order-id-null-when-missing',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.payment.orderId, null, 'Missing custom_id → null orderId');
      },
    },

    {
      name: 'payment-event-metadata-passed-through',
      async run({ assert }) {
        const result = toUnifiedSubscription({}, { eventName: 'BILLING.SUBSCRIPTION.ACTIVATED', eventId: 'WH-123' });
        assert.equal(result.payment.updatedBy.event.name, 'BILLING.SUBSCRIPTION.ACTIVATED', 'Event name passed through');
        assert.equal(result.payment.updatedBy.event.id, 'WH-123', 'Event ID passed through');
      },
    },

    {
      name: 'payment-event-metadata-null-when-missing',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.payment.updatedBy.event.name, null, 'Missing event name → null');
        assert.equal(result.payment.updatedBy.event.id, null, 'Missing event ID → null');
      },
    },

    // ─── Price resolution ───

    {
      name: 'price-resolves-from-config',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: {
            product_id: 'PROD-plus',
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'MONTH', interval_count: 1 } },
            ],
          },
        });
        assert.equal(result.payment.price, 9.99, 'Price should match config for plus/monthly');
      },
    },

    {
      name: 'price-resolves-annually',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: {
            product_id: 'PROD-pro',
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'YEAR', interval_count: 1 } },
            ],
          },
        });
        assert.equal(result.payment.price, 299.99, 'Price should match config for pro/annually');
      },
    },

    {
      name: 'price-zero-when-product-unknown',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          _plan: { product_id: 'PROD-nonexistent' },
        });
        assert.equal(result.payment.price, 0, 'Unknown product → price 0');
      },
    },

    // ─── Custom ID parsing ───

    {
      name: 'custom-id-parses-uid-and-order-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          custom_id: 'uid:user-123,orderId:ord-456',
        });
        assert.equal(result.payment.orderId, 'ord-456', 'orderId from custom_id');
      },
    },

    {
      name: 'custom-id-handles-colons-in-values',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          custom_id: 'uid:user:with:colons,orderId:ord-789',
        });
        assert.equal(result.payment.orderId, 'ord-789', 'orderId parsed correctly');
      },
    },

    {
      name: 'custom-id-handles-empty-string',
      async run({ assert }) {
        const result = toUnifiedSubscription({ custom_id: '' });
        assert.equal(result.payment.orderId, null, 'Empty custom_id → null');
      },
    },

    // ─── Full unified shape ───

    {
      name: 'full-active-subscription-shape',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          id: 'I-FULL-TEST',
          status: 'ACTIVE',
          custom_id: 'uid:user-full,orderId:ord-full',
          start_time: '2024-01-01T00:00:00Z',
          billing_info: { next_billing_time: '2024-02-01T00:00:00Z' },
          _plan: {
            product_id: 'PROD-pro',
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'MONTH', interval_count: 1 } },
            ],
          },
        }, { eventName: 'BILLING.SUBSCRIPTION.ACTIVATED', eventId: 'WH-FULL' });

        // Verify all top-level keys exist
        assert.ok(result.product, 'Should have product');
        assert.ok(result.status, 'Should have status');
        assert.ok(result.expires, 'Should have expires');
        assert.ok(result.trial, 'Should have trial');
        assert.ok(result.cancellation, 'Should have cancellation');
        assert.ok(result.payment, 'Should have payment');

        // Verify values
        assert.equal(result.product.id, 'pro', 'Product should be pro');
        assert.equal(result.status, 'active', 'Status should be active');
        assert.equal(result.trial.claimed, false, 'Trial should not be claimed');
        assert.equal(result.cancellation.pending, false, 'Should not be pending cancellation');
        assert.equal(result.payment.processor, 'paypal', 'Processor should be paypal');
        assert.equal(result.payment.resourceId, 'I-FULL-TEST', 'Resource ID should match');
        assert.equal(result.payment.frequency, 'monthly', 'Frequency should be monthly');
        assert.equal(result.payment.orderId, 'ord-full', 'Order ID should match');
        assert.equal(result.payment.updatedBy.event.name, 'BILLING.SUBSCRIPTION.ACTIVATED', 'Event name should match');
      },
    },

    {
      name: 'empty-subscription-gets-safe-defaults',
      async run({ assert }) {
        const result = toUnifiedSubscription({});

        assert.equal(result.product.id, 'basic', 'Empty → basic product');
        assert.equal(result.status, 'cancelled', 'Empty → cancelled (no status field)');
        assert.equal(result.trial.claimed, false, 'Empty → trial not claimed');
        assert.equal(result.cancellation.pending, false, 'Empty → not pending');
        assert.equal(result.payment.processor, 'paypal', 'Empty → still paypal');
        assert.equal(result.payment.orderId, null, 'Empty → null orderId');
        assert.equal(result.payment.resourceId, null, 'Empty → null resourceId');
        assert.equal(result.payment.frequency, null, 'Empty → null frequency');
      },
    },

    // ─── Combination / edge-case scenarios ───

    {
      name: 'combo-active-with-trial',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          id: 'I-TRIAL-ACTIVE',
          status: 'ACTIVE',
          start_time: '2024-01-01T00:00:00Z',
          _plan: {
            product_id: 'PROD-plus',
            billing_cycles: [
              {
                tenure_type: 'TRIAL',
                frequency: { interval_unit: 'DAY', interval_count: 1 },
                total_cycles: 14,
              },
              {
                tenure_type: 'REGULAR',
                frequency: { interval_unit: 'MONTH', interval_count: 1 },
              },
            ],
          },
        });

        assert.equal(result.status, 'active', 'Active with trial → active');
        assert.equal(result.trial.claimed, true, 'Trial should be claimed');
        assert.equal(result.product.id, 'plus', 'Should resolve product');
        assert.equal(result.payment.frequency, 'monthly', 'Regular cycle → monthly');
      },
    },

    {
      name: 'combo-suspended-subscription',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          id: 'I-SUSPENDED',
          status: 'SUSPENDED',
          custom_id: 'uid:user-sus,orderId:ord-sus',
          _plan: {
            product_id: 'PROD-pro',
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'YEAR', interval_count: 1 } },
            ],
          },
        });

        assert.equal(result.status, 'suspended', 'SUSPENDED → suspended');
        assert.equal(result.product.id, 'pro', 'Should resolve product');
        assert.equal(result.payment.frequency, 'annually', 'Year → annually');
        assert.equal(result.cancellation.pending, false, 'Not cancelled, just suspended');
      },
    },

    {
      name: 'combo-cancelled-with-update-time',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          id: 'I-CANCEL',
          status: 'CANCELLED',
          status_update_time: '2024-06-15T18:30:00Z',
          custom_id: 'uid:user-cancel,orderId:ord-cancel',
          _plan: {
            product_id: 'PROD-plus',
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'MONTH', interval_count: 1 } },
            ],
          },
        });

        assert.equal(result.status, 'cancelled', 'CANCELLED → cancelled');
        assert.equal(result.cancellation.pending, false, 'Already cancelled → not pending');
        assert.ok(result.cancellation.date.timestampUNIX > 0, 'Should have cancellation date');
        assert.equal(result.payment.orderId, 'ord-cancel', 'Order ID preserved');
      },
    },

    {
      name: 'combo-expired-subscription',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          id: 'I-EXPIRED',
          status: 'EXPIRED',
          _plan: {
            product_id: 'PROD-pro',
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'MONTH', interval_count: 1 } },
            ],
          },
        });

        assert.equal(result.status, 'cancelled', 'EXPIRED → cancelled');
        assert.equal(result.product.id, 'pro', 'Should still resolve product');
      },
    },

    // ─── Unified shape matches Stripe output ───

    {
      name: 'shape-matches-stripe-output-keys',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          id: 'I-SHAPE',
          status: 'ACTIVE',
          custom_id: 'uid:u1,orderId:o1',
          start_time: '2024-01-01T00:00:00Z',
          billing_info: { next_billing_time: '2024-02-01T00:00:00Z' },
          _plan: {
            product_id: 'PROD-plus',
            billing_cycles: [
              { tenure_type: 'REGULAR', frequency: { interval_unit: 'MONTH', interval_count: 1 } },
            ],
          },
        });

        // Top-level keys
        const topKeys = Object.keys(result).sort();
        assert.deepEqual(topKeys, ['cancellation', 'expires', 'payment', 'product', 'status', 'trial'], 'Should have same top-level keys as Stripe unified');

        // Product shape
        assert.ok(result.product.id, 'product.id exists');
        assert.ok(result.product.name, 'product.name exists');

        // Expires shape
        assert.isType(result.expires.timestamp, 'string', 'expires.timestamp is string');
        assert.isType(result.expires.timestampUNIX, 'number', 'expires.timestampUNIX is number');

        // Trial shape
        assert.isType(result.trial.claimed, 'boolean', 'trial.claimed is boolean');
        assert.ok(result.trial.expires, 'trial.expires exists');

        // Cancellation shape
        assert.isType(result.cancellation.pending, 'boolean', 'cancellation.pending is boolean');
        assert.ok(result.cancellation.date, 'cancellation.date exists');

        // Payment shape
        assert.equal(result.payment.processor, 'paypal', 'payment.processor');
        assert.ok('orderId' in result.payment, 'payment.orderId exists');
        assert.ok('resourceId' in result.payment, 'payment.resourceId exists');
        assert.ok('frequency' in result.payment, 'payment.frequency exists');
        assert.ok('price' in result.payment, 'payment.price exists');
        assert.ok(result.payment.startDate, 'payment.startDate exists');
        assert.ok(result.payment.updatedBy, 'payment.updatedBy exists');
        assert.ok(result.payment.updatedBy.event, 'payment.updatedBy.event exists');
        assert.ok(result.payment.updatedBy.date, 'payment.updatedBy.date exists');
      },
    },

    // ─── Real PayPal sandbox fixtures ───

    {
      name: 'fixture-active-produces-valid-shape',
      async run({ assert }) {
        const result = toUnifiedSubscription(FIXTURE_ACTIVE);

        assert.equal(result.status, 'active', 'ACTIVE fixture → active');
        assert.equal(result.payment.processor, 'paypal', 'Processor is paypal');
        assert.equal(result.payment.resourceId, 'I-MTPRX0B9LV4R', 'Resource ID from fixture');
        assert.equal(result.payment.orderId, 'ord-sub-123', 'orderId from custom_id');
        assert.isType(result.expires.timestamp, 'string', 'expires.timestamp is string');
        assert.isType(result.expires.timestampUNIX, 'number', 'expires.timestampUNIX is number');
        assert.equal(result.trial.claimed, false, 'No trial in fixture');
        assert.equal(result.cancellation.pending, false, 'Not cancelled');
      },
    },

    {
      name: 'fixture-cancelled-produces-valid-shape',
      async run({ assert }) {
        const result = toUnifiedSubscription(FIXTURE_CANCELLED);

        assert.equal(result.status, 'cancelled', 'CANCELLED fixture → cancelled');
        assert.equal(result.payment.resourceId, 'I-MTPRX0B9LV4R', 'Resource ID from fixture');
        assert.equal(result.payment.orderId, 'ord-sub-123', 'orderId from custom_id');
        assert.equal(result.cancellation.pending, false, 'Already cancelled');
      },
    },

    {
      name: 'fixture-suspended-produces-valid-shape',
      async run({ assert }) {
        const result = toUnifiedSubscription(FIXTURE_SUSPENDED);

        assert.equal(result.status, 'suspended', 'SUSPENDED fixture → suspended');
        assert.equal(result.payment.resourceId, 'I-MTPRX0B9LV4R', 'Resource ID from fixture');
        assert.equal(result.cancellation.pending, false, 'Not cancelled, just suspended');
      },
    },

    {
      name: 'fixture-all-produce-valid-unified-keys',
      async run({ assert }) {
        const fixtures = [FIXTURE_ACTIVE, FIXTURE_CANCELLED, FIXTURE_SUSPENDED];
        const expectedKeys = ['cancellation', 'expires', 'payment', 'product', 'status', 'trial'];

        for (let i = 0; i < fixtures.length; i++) {
          const result = toUnifiedSubscription(fixtures[i]);
          const keys = Object.keys(result).sort();
          assert.deepEqual(keys, expectedKeys, `Fixture ${i} should have correct top-level keys`);
          assert.isType(result.payment.updatedBy.date.timestamp, 'string', `Fixture ${i}: updatedBy.date.timestamp is string`);
          assert.isType(result.payment.updatedBy.date.timestampUNIX, 'number', `Fixture ${i}: updatedBy.date.timestampUNIX is number`);
        }
      },
    },
  ],
};
