/**
 * Test: Chargebee toUnifiedSubscription()
 * Unit tests for the Chargebee library's raw subscription → unified subscription transformation
 *
 * Tests the pure function directly — no emulator, no Firestore, no HTTP
 */
const Chargebee = require('../../../../src/manager/libraries/payment/processors/chargebee.js');

// Chargebee fixtures
const FIXTURE_ACTIVE = require('../../../fixtures/chargebee/subscription-active.json');
const FIXTURE_CANCELLED = require('../../../fixtures/chargebee/subscription-cancelled.json');
const FIXTURE_TRIAL = require('../../../fixtures/chargebee/subscription-in-trial.json');
const FIXTURE_NON_RENEWING = require('../../../fixtures/chargebee/subscription-non-renewing.json');
const FIXTURE_PAUSED = require('../../../fixtures/chargebee/subscription-paused.json');
const FIXTURE_LEGACY = require('../../../fixtures/chargebee/subscription-legacy-plan.json');

// Mock config matching the BEM template
const MOCK_CONFIG = {
  payment: {
    products: [
      { id: 'basic', name: 'Basic', type: 'subscription', limits: { requests: 100 } },
      {
        id: 'pro', name: 'Pro', type: 'subscription',
        prices: { monthly: 4.99, annually: 49.99 },
        chargebee: {
          itemId: 'somiibo-pro',
          legacyPlanIds: ['somiibo-premium-monthly-1', 'somiibo-premium-annually-1'],
        },
      },
      {
        id: 'plus', name: 'Plus', type: 'subscription',
        prices: { monthly: 2.99, annually: 29.99 },
        chargebee: {
          itemId: 'somiibo-plus',
          legacyPlanIds: [],
        },
      },
    ],
  },
};

function toUnifiedSubscription(rawSubscription, options) {
  return Chargebee.toUnifiedSubscription(rawSubscription, { config: MOCK_CONFIG, ...options });
}

module.exports = {
  description: 'Chargebee toUnifiedSubscription() transformation',
  type: 'group',

  tests: [
    // ─── Status mapping ───

    {
      name: 'status-active',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'active' });
        assert.equal(result.status, 'active', 'Chargebee active → unified active');
      },
    },

    {
      name: 'status-in-trial',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'in_trial', trial_start: 1000, trial_end: 2000 });
        assert.equal(result.status, 'active', 'Chargebee in_trial → unified active');
      },
    },

    {
      name: 'status-non-renewing',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'non_renewing' });
        assert.equal(result.status, 'active', 'Chargebee non_renewing → unified active');
      },
    },

    {
      name: 'status-future',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'future' });
        assert.equal(result.status, 'active', 'Chargebee future → unified active');
      },
    },

    {
      name: 'status-paused',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'paused' });
        assert.equal(result.status, 'suspended', 'Chargebee paused → unified suspended');
      },
    },

    {
      name: 'status-cancelled',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'cancelled' });
        assert.equal(result.status, 'cancelled', 'Chargebee cancelled → unified cancelled');
      },
    },

    {
      name: 'status-transferred',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'transferred' });
        assert.equal(result.status, 'cancelled', 'Chargebee transferred → unified cancelled');
      },
    },

    {
      name: 'status-unknown-defaults-to-cancelled',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'some_future_status' });
        assert.equal(result.status, 'cancelled', 'Unknown status → cancelled');
      },
    },

    // ─── Product resolution (Items model) ───

    {
      name: 'product-resolves-from-item-price-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          subscription_items: [{ item_price_id: 'somiibo-pro-monthly' }],
        });
        assert.equal(result.product.id, 'pro', 'Should resolve to pro');
        assert.equal(result.product.name, 'Pro', 'Should have correct name');
      },
    },

    {
      name: 'product-resolves-plus-from-item-price-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          subscription_items: [{ item_price_id: 'somiibo-plus-annually' }],
        });
        assert.equal(result.product.id, 'plus', 'Should resolve to plus');
        assert.equal(result.product.name, 'Plus', 'Should have correct name');
      },
    },

    // ─── Product resolution (Legacy Plans model) ───

    {
      name: 'product-resolves-from-legacy-plan-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          plan_id: 'somiibo-premium-monthly-1',
        });
        assert.equal(result.product.id, 'pro', 'Legacy plan → pro');
        assert.equal(result.product.name, 'Pro', 'Legacy plan → Pro name');
      },
    },

    {
      name: 'product-resolves-from-legacy-annual-plan-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          plan_id: 'somiibo-premium-annually-1',
        });
        assert.equal(result.product.id, 'pro', 'Legacy annual plan → pro');
      },
    },

    {
      name: 'product-falls-back-to-basic-on-unknown',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          subscription_items: [{ item_price_id: 'unknown-product-monthly' }],
        });
        assert.equal(result.product.id, 'basic', 'Unknown item → basic');
      },
    },

    {
      name: 'product-falls-back-to-basic-on-missing',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.product.id, 'basic', 'No plan → basic');
      },
    },

    {
      name: 'product-falls-back-to-basic-without-config',
      async run({ assert }) {
        const result = Chargebee.toUnifiedSubscription(
          { subscription_items: [{ item_price_id: 'somiibo-pro-monthly' }] },
          {},
        );
        assert.equal(result.product.id, 'basic', 'No config → basic');
      },
    },

    // ─── Frequency resolution ───

    {
      name: 'frequency-monthly-from-item-price-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          subscription_items: [{ item_price_id: 'somiibo-pro-monthly' }],
        });
        assert.equal(result.payment.frequency, 'monthly', 'item_price_id suffix monthly → monthly');
      },
    },

    {
      name: 'frequency-annually-from-item-price-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          subscription_items: [{ item_price_id: 'somiibo-pro-annually' }],
        });
        assert.equal(result.payment.frequency, 'annually', 'item_price_id suffix annually → annually');
      },
    },

    {
      name: 'frequency-weekly-from-item-price-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          subscription_items: [{ item_price_id: 'somiibo-pro-weekly' }],
        });
        assert.equal(result.payment.frequency, 'weekly', 'item_price_id suffix weekly → weekly');
      },
    },

    {
      name: 'frequency-daily-from-item-price-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          subscription_items: [{ item_price_id: 'somiibo-pro-daily' }],
        });
        assert.equal(result.payment.frequency, 'daily', 'item_price_id suffix daily → daily');
      },
    },

    {
      name: 'frequency-from-legacy-billing-period-unit',
      async run({ assert }) {
        const result = toUnifiedSubscription({ billing_period_unit: 'month' });
        assert.equal(result.payment.frequency, 'monthly', 'Legacy month → monthly');
      },
    },

    {
      name: 'frequency-year-from-legacy',
      async run({ assert }) {
        const result = toUnifiedSubscription({ billing_period_unit: 'year' });
        assert.equal(result.payment.frequency, 'annually', 'Legacy year → annually');
      },
    },

    {
      name: 'frequency-null-when-missing',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.payment.frequency, null, 'Missing → null');
      },
    },

    // ─── Trial resolution ───

    {
      name: 'trial-claimed-when-both-dates-present',
      async run({ assert }) {
        const result = toUnifiedSubscription({ trial_start: 1700000000, trial_end: 1701209600 });
        assert.equal(result.trial.claimed, true, 'Both trial dates → claimed');
        assert.ok(result.trial.expires.timestampUNIX > 0, 'Trial expires should be set');
      },
    },

    {
      name: 'trial-not-claimed-when-no-dates',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.trial.claimed, false, 'No trial dates → not claimed');
      },
    },

    {
      name: 'trial-not-claimed-when-only-start',
      async run({ assert }) {
        const result = toUnifiedSubscription({ trial_start: 1700000000 });
        assert.equal(result.trial.claimed, false, 'Only trial_start → not claimed');
      },
    },

    // ─── Cancellation resolution ───

    {
      name: 'cancellation-pending-when-non-renewing',
      async run({ assert }) {
        const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 30;
        const result = toUnifiedSubscription({
          status: 'non_renewing',
          current_term_end: futureTimestamp,
        });
        assert.equal(result.cancellation.pending, true, 'non_renewing → pending');
        assert.ok(result.cancellation.date.timestampUNIX > 0, 'Should have cancellation date');
      },
    },

    {
      name: 'cancellation-completed-when-cancelled',
      async run({ assert }) {
        const pastTimestamp = Math.floor(Date.now() / 1000) - 86400;
        const result = toUnifiedSubscription({
          status: 'cancelled',
          cancelled_at: pastTimestamp,
        });
        assert.equal(result.cancellation.pending, false, 'cancelled → not pending');
        assert.ok(result.cancellation.date.timestampUNIX > 0, 'Should have cancellation date');
      },
    },

    {
      name: 'cancellation-none',
      async run({ assert }) {
        const result = toUnifiedSubscription({ status: 'active' });
        assert.equal(result.cancellation.pending, false, 'No cancellation → not pending');
      },
    },

    // ─── Expiration and start date ───

    {
      name: 'expires-from-current-term-end',
      async run({ assert }) {
        const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 30;
        const result = toUnifiedSubscription({ current_term_end: futureTimestamp });
        assert.ok(result.expires.timestampUNIX > 0, 'Should have expiration');
      },
    },

    {
      name: 'expires-defaults-to-epoch-when-missing',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.expires.timestampUNIX, 0, 'Missing current_term_end → epoch');
      },
    },

    {
      name: 'start-date-from-started-at',
      async run({ assert }) {
        const startTimestamp = Math.floor(Date.now() / 1000) - 86400 * 30;
        const result = toUnifiedSubscription({ started_at: startTimestamp });
        assert.ok(result.payment.startDate.timestampUNIX > 0, 'Should have start date');
      },
    },

    {
      name: 'start-date-fallback-to-created-at',
      async run({ assert }) {
        const createTimestamp = Math.floor(Date.now() / 1000) - 86400 * 60;
        const result = toUnifiedSubscription({ created_at: createTimestamp });
        assert.ok(result.payment.startDate.timestampUNIX > 0, 'Should use created_at as fallback');
      },
    },

    {
      name: 'start-date-defaults-to-epoch-when-missing',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.payment.startDate.timestampUNIX, 0, 'Missing start dates → epoch');
      },
    },

    // ─── Payment metadata ───

    {
      name: 'payment-processor-always-chargebee',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.payment.processor, 'chargebee', 'Processor should always be chargebee');
      },
    },

    {
      name: 'payment-resource-id-from-subscription-id',
      async run({ assert }) {
        const result = toUnifiedSubscription({ id: 'sub_abc123' });
        assert.equal(result.payment.resourceId, 'sub_abc123', 'resourceId should be subscription ID');
      },
    },

    {
      name: 'payment-order-id-from-meta-data',
      async run({ assert }) {
        const result = toUnifiedSubscription({ meta_data: '{"orderId":"1234-5678-9012"}' });
        assert.equal(result.payment.orderId, '1234-5678-9012', 'orderId should come from meta_data');
      },
    },

    {
      name: 'payment-order-id-from-cf-clientorderid-legacy',
      async run({ assert }) {
        const result = toUnifiedSubscription({ cf_clientorderid: '1678790168794-0784' });
        assert.equal(result.payment.orderId, '1678790168794-0784', 'orderId should come from cf_clientorderid');
      },
    },

    {
      name: 'payment-order-id-null-when-missing',
      async run({ assert }) {
        const result = toUnifiedSubscription({});
        assert.equal(result.payment.orderId, null, 'Missing metadata → null orderId');
      },
    },

    {
      name: 'payment-event-metadata-passed-through',
      async run({ assert }) {
        const result = toUnifiedSubscription({}, { eventName: 'subscription_created', eventId: 'ev_123' });
        assert.equal(result.payment.updatedBy.event.name, 'subscription_created', 'Event name passed through');
        assert.equal(result.payment.updatedBy.event.id, 'ev_123', 'Event ID passed through');
      },
    },

    // ─── UID extraction ───

    {
      name: 'uid-from-meta-data',
      async run({ assert }) {
        const resource = { meta_data: '{"uid":"test-user-123","orderId":"1234-5678-9012"}' };
        assert.equal(Chargebee.getUid(resource), 'test-user-123', 'UID from meta_data');
      },
    },

    {
      name: 'uid-from-cf-uid-legacy',
      async run({ assert }) {
        const resource = { cf_uid: 'legacy-user-456' };
        assert.equal(Chargebee.getUid(resource), 'legacy-user-456', 'UID from cf_uid');
      },
    },

    {
      name: 'uid-null-when-missing',
      async run({ assert }) {
        assert.equal(Chargebee.getUid({}), null, 'No metadata → null');
      },
    },

    // ─── Full unified shape ───

    {
      name: 'full-active-subscription-shape',
      async run({ assert }) {
        const now = Math.floor(Date.now() / 1000);
        const result = toUnifiedSubscription({
          id: 'sub_full_test',
          status: 'active',
          subscription_items: [{ item_price_id: 'somiibo-pro-monthly' }],
          current_term_end: now + 86400 * 30,
          started_at: now - 86400 * 60,
          meta_data: '{"uid":"full-test-uid","orderId":"9999-8888-7777"}',
        }, { eventName: 'subscription_changed', eventId: 'ev_full' });

        assert.ok(result.product, 'Should have product');
        assert.ok(result.status, 'Should have status');
        assert.ok(result.expires, 'Should have expires');
        assert.ok(result.trial, 'Should have trial');
        assert.ok(result.cancellation, 'Should have cancellation');
        assert.ok(result.payment, 'Should have payment');

        assert.equal(result.product.id, 'pro', 'Product should be pro');
        assert.equal(result.status, 'active', 'Status should be active');
        assert.equal(result.trial.claimed, false, 'Trial should not be claimed');
        assert.equal(result.cancellation.pending, false, 'Should not be pending cancellation');
        assert.equal(result.payment.processor, 'chargebee', 'Processor should be chargebee');
        assert.equal(result.payment.resourceId, 'sub_full_test', 'Resource ID should match');
        assert.equal(result.payment.frequency, 'monthly', 'Frequency should be monthly');
        assert.equal(result.payment.orderId, '9999-8888-7777', 'Order ID from meta_data');
        assert.equal(result.payment.updatedBy.event.name, 'subscription_changed', 'Event name should match');
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
        assert.equal(result.payment.processor, 'chargebee', 'Empty → still chargebee');
        assert.equal(result.payment.orderId, null, 'Empty → null orderId');
        assert.equal(result.payment.resourceId, null, 'Empty → null resourceId');
        assert.equal(result.payment.frequency, null, 'Empty → null frequency');
      },
    },

    // ─── Real fixtures ───

    {
      name: 'fixture-active-status',
      async run({ assert }) {
        const result = toUnifiedSubscription(FIXTURE_ACTIVE);
        assert.equal(result.status, 'active', 'Active fixture → active');
        assert.equal(result.payment.processor, 'chargebee', 'Processor is chargebee');
        assert.equal(result.payment.resourceId, FIXTURE_ACTIVE.id, 'resourceId matches fixture');
      },
    },

    {
      name: 'fixture-active-product-resolves',
      async run({ assert }) {
        const result = toUnifiedSubscription(FIXTURE_ACTIVE);
        assert.equal(result.product.id, 'pro', 'somiibo-pro-monthly → pro');
        assert.equal(result.payment.frequency, 'monthly', 'Active fixture → monthly');
      },
    },

    {
      name: 'fixture-active-metadata',
      async run({ assert }) {
        const result = toUnifiedSubscription(FIXTURE_ACTIVE);
        assert.equal(result.payment.orderId, '1234-5678-9012', 'Order ID from meta_data');
      },
    },

    {
      name: 'fixture-cancelled-status',
      async run({ assert }) {
        const result = toUnifiedSubscription(FIXTURE_CANCELLED);
        assert.equal(result.status, 'cancelled', 'Cancelled fixture → cancelled');
        assert.equal(result.cancellation.pending, false, 'Not pending — already cancelled');
        assert.ok(result.cancellation.date.timestampUNIX > 0, 'Should have cancellation date');
      },
    },

    {
      name: 'fixture-trial-status',
      async run({ assert }) {
        const result = toUnifiedSubscription(FIXTURE_TRIAL);
        assert.equal(result.status, 'active', 'Trial fixture → active');
        assert.equal(result.trial.claimed, true, 'Trial → claimed');
        assert.ok(result.trial.expires.timestampUNIX > 0, 'Trial expiration should be set');
      },
    },

    {
      name: 'fixture-non-renewing-status',
      async run({ assert }) {
        const result = toUnifiedSubscription(FIXTURE_NON_RENEWING);
        assert.equal(result.status, 'active', 'Non-renewing fixture → active');
        assert.equal(result.cancellation.pending, true, 'Non-renewing → pending cancellation');
      },
    },

    {
      name: 'fixture-paused-status',
      async run({ assert }) {
        const result = toUnifiedSubscription(FIXTURE_PAUSED);
        assert.equal(result.status, 'suspended', 'Paused fixture → suspended');
      },
    },

    {
      name: 'fixture-legacy-plan-resolves',
      async run({ assert }) {
        const result = toUnifiedSubscription(FIXTURE_LEGACY);
        assert.equal(result.product.id, 'pro', 'Legacy plan → pro via legacyPlanIds');
        assert.equal(result.payment.frequency, 'monthly', 'Legacy billing_period_unit month → monthly');
        assert.equal(result.payment.orderId, '1678790168794-0784', 'Legacy cf_clientorderid → orderId');
        assert.equal(result.status, 'active', 'Legacy active → active');
      },
    },

    {
      name: 'fixture-all-have-unified-shape',
      async run({ assert }) {
        const fixtures = [FIXTURE_ACTIVE, FIXTURE_CANCELLED, FIXTURE_TRIAL, FIXTURE_NON_RENEWING, FIXTURE_PAUSED, FIXTURE_LEGACY];
        const names = ['active', 'cancelled', 'trial', 'non-renewing', 'paused', 'legacy'];

        for (let i = 0; i < fixtures.length; i++) {
          const result = toUnifiedSubscription(fixtures[i]);
          const label = names[i];

          assert.ok(result.product, `${label}: should have product`);
          assert.ok(result.product.id, `${label}: should have product.id`);
          assert.ok(result.product.name, `${label}: should have product.name`);
          assert.isType(result.status, 'string', `${label}: status should be string`);
          assert.ok(result.expires, `${label}: should have expires`);
          assert.ok(result.trial, `${label}: should have trial`);
          assert.ok(result.cancellation, `${label}: should have cancellation`);
          assert.ok(result.payment, `${label}: should have payment`);
          assert.equal(result.payment.processor, 'chargebee', `${label}: processor should be chargebee`);
          assert.ok(result.payment.updatedBy, `${label}: should have updatedBy`);
          assert.ok(result.payment.updatedBy.date, `${label}: should have updatedBy.date`);
        }
      },
    },

    // ─── Combination / edge-case scenarios ───

    {
      name: 'combo-trial-with-non-renewing',
      async run({ assert }) {
        const now = Math.floor(Date.now() / 1000);
        const result = toUnifiedSubscription({
          id: 'sub_trial_cancel',
          status: 'non_renewing',
          trial_start: now - 86400 * 3,
          trial_end: now + 86400 * 11,
          current_term_end: now + 86400 * 11,
          started_at: now - 86400 * 3,
          subscription_items: [{ item_price_id: 'somiibo-pro-monthly' }],
        });

        assert.equal(result.status, 'active', 'Non-renewing + trial → still active');
        assert.equal(result.trial.claimed, true, 'Trial should be claimed');
        assert.equal(result.cancellation.pending, true, 'Cancel should be pending');
      },
    },

    {
      name: 'combo-meta-data-overrides-cf-fields',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          meta_data: '{"uid":"new-uid","orderId":"new-order"}',
          cf_clientorderid: 'old-order',
          cf_uid: 'old-uid',
        });

        assert.equal(result.payment.orderId, 'new-order', 'meta_data orderId takes priority');
        assert.equal(Chargebee.getUid({
          meta_data: '{"uid":"new-uid"}',
          cf_uid: 'old-uid',
        }), 'new-uid', 'meta_data uid takes priority');
      },
    },

    {
      name: 'combo-items-model-overrides-legacy-plan',
      async run({ assert }) {
        const result = toUnifiedSubscription({
          subscription_items: [{ item_price_id: 'somiibo-plus-monthly' }],
          plan_id: 'somiibo-premium-monthly-1',
          billing_period_unit: 'year',
        });

        assert.equal(result.product.id, 'plus', 'Items model product takes priority over legacy');
        assert.equal(result.payment.frequency, 'monthly', 'Items model frequency takes priority over legacy billing_period_unit');
      },
    },
  ],
};
