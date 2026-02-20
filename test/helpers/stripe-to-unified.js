/**
 * Test: Stripe toUnified()
 * Unit tests for the Stripe library's raw subscription → unified subscription transformation
 *
 * Tests the pure function directly — no emulator, no Firestore, no HTTP
 */
const Stripe = require('../../src/manager/libraries/stripe.js');

// Real Stripe CLI fixtures (generated via `stripe trigger`)
const FIXTURE_ACTIVE = require('../fixtures/stripe/subscription-active.json');
const FIXTURE_CANCELED = require('../fixtures/stripe/subscription-canceled.json');
const FIXTURE_TRIALING = require('../fixtures/stripe/subscription-trialing.json');

// Mock config matching the BEM template
const MOCK_CONFIG = {
  payment: {
    products: [
      { id: 'basic', name: 'Basic', type: 'subscription', limits: { requests: 100 } },
      {
        id: 'plus', name: 'Plus', type: 'subscription',
        prices: {
          monthly: { amount: 9.99, stripe: 'price_plus_monthly' },
          annually: { amount: 99.99, stripe: 'price_plus_annually' },
        },
      },
      {
        id: 'pro', name: 'Pro', type: 'subscription',
        prices: {
          monthly: { amount: 29.99, stripe: 'price_pro_monthly' },
          annually: { amount: 299.99, stripe: 'price_pro_annually' },
        },
      },
    ],
  },
};

function toUnified(rawSubscription, options) {
  return Stripe.toUnified(rawSubscription, { config: MOCK_CONFIG, ...options });
}

module.exports = {
  description: 'Stripe toUnified() transformation',
  type: 'group',

  tests: [
    // ─── Status mapping ───

    {
      name: 'status-active',
      async run({ assert }) {
        const result = toUnified({ status: 'active' });
        assert.equal(result.status, 'active', 'Stripe active → unified active');
      },
    },

    {
      name: 'status-trialing',
      async run({ assert }) {
        const result = toUnified({ status: 'trialing', trial_start: 1000, trial_end: 2000 });
        assert.equal(result.status, 'active', 'Stripe trialing → unified active');
      },
    },

    {
      name: 'status-past-due',
      async run({ assert }) {
        const result = toUnified({ status: 'past_due' });
        assert.equal(result.status, 'suspended', 'Stripe past_due → unified suspended');
      },
    },

    {
      name: 'status-unpaid',
      async run({ assert }) {
        const result = toUnified({ status: 'unpaid' });
        assert.equal(result.status, 'suspended', 'Stripe unpaid → unified suspended');
      },
    },

    {
      name: 'status-canceled',
      async run({ assert }) {
        const result = toUnified({ status: 'canceled' });
        assert.equal(result.status, 'cancelled', 'Stripe canceled → unified cancelled');
      },
    },

    {
      name: 'status-incomplete',
      async run({ assert }) {
        const result = toUnified({ status: 'incomplete' });
        assert.equal(result.status, 'cancelled', 'Stripe incomplete → unified cancelled');
      },
    },

    {
      name: 'status-incomplete-expired',
      async run({ assert }) {
        const result = toUnified({ status: 'incomplete_expired' });
        assert.equal(result.status, 'cancelled', 'Stripe incomplete_expired → unified cancelled');
      },
    },

    {
      name: 'status-unknown-defaults-to-cancelled',
      async run({ assert }) {
        const result = toUnified({ status: 'some_future_status' });
        assert.equal(result.status, 'cancelled', 'Unknown status → cancelled');
      },
    },

    // ─── Product resolution ───

    {
      name: 'product-resolves-monthly-price',
      async run({ assert }) {
        const result = toUnified({ plan: { id: 'price_plus_monthly' } });
        assert.equal(result.product.id, 'plus', 'Should resolve to plus');
        assert.equal(result.product.name, 'Plus', 'Should have correct name');
      },
    },

    {
      name: 'product-resolves-annual-price',
      async run({ assert }) {
        const result = toUnified({ plan: { id: 'price_pro_annually' } });
        assert.equal(result.product.id, 'pro', 'Should resolve to pro');
        assert.equal(result.product.name, 'Pro', 'Should have correct name');
      },
    },

    {
      name: 'product-resolves-from-items-array',
      async run({ assert }) {
        const result = toUnified({
          items: { data: [{ price: { id: 'price_plus_monthly' } }] },
        });
        assert.equal(result.product.id, 'plus', 'Should resolve from items.data[0].price.id');
      },
    },

    {
      name: 'product-falls-back-to-basic-on-unknown-price',
      async run({ assert }) {
        const result = toUnified({ plan: { id: 'price_nonexistent' } });
        assert.equal(result.product.id, 'basic', 'Unknown price → basic');
        assert.equal(result.product.name, 'Basic', 'Unknown price → Basic name');
      },
    },

    {
      name: 'product-falls-back-to-basic-on-missing-plan',
      async run({ assert }) {
        const result = toUnified({});
        assert.equal(result.product.id, 'basic', 'No plan → basic');
      },
    },

    {
      name: 'product-falls-back-to-basic-without-config',
      async run({ assert }) {
        const result = Stripe.toUnified({ plan: { id: 'price_plus_monthly' } }, {});
        assert.equal(result.product.id, 'basic', 'No config → basic');
      },
    },

    // ─── Frequency resolution ───

    {
      name: 'frequency-month',
      async run({ assert }) {
        const result = toUnified({ plan: { interval: 'month' } });
        assert.equal(result.payment.frequency, 'monthly', 'month → monthly');
      },
    },

    {
      name: 'frequency-year',
      async run({ assert }) {
        const result = toUnified({ plan: { interval: 'year' } });
        assert.equal(result.payment.frequency, 'annually', 'year → annually');
      },
    },

    {
      name: 'frequency-week',
      async run({ assert }) {
        const result = toUnified({ plan: { interval: 'week' } });
        assert.equal(result.payment.frequency, 'weekly', 'week → weekly');
      },
    },

    {
      name: 'frequency-day',
      async run({ assert }) {
        const result = toUnified({ plan: { interval: 'day' } });
        assert.equal(result.payment.frequency, 'daily', 'day → daily');
      },
    },

    {
      name: 'frequency-null-when-missing',
      async run({ assert }) {
        const result = toUnified({});
        assert.equal(result.payment.frequency, null, 'Missing interval → null');
      },
    },

    {
      name: 'frequency-from-items-recurring',
      async run({ assert }) {
        const result = toUnified({
          items: { data: [{ price: { recurring: { interval: 'year' } } }] },
        });
        assert.equal(result.payment.frequency, 'annually', 'items recurring year → annually');
      },
    },

    // ─── Trial resolution ───

    {
      name: 'trial-claimed-when-both-dates-present',
      async run({ assert }) {
        const result = toUnified({ trial_start: 1700000000, trial_end: 1701209600 });
        assert.equal(result.trial.claimed, true, 'Both trial dates → claimed');
        assert.ok(result.trial.expires.timestampUNIX > 0, 'Trial expires should be set');
      },
    },

    {
      name: 'trial-not-claimed-when-no-dates',
      async run({ assert }) {
        const result = toUnified({});
        assert.equal(result.trial.claimed, false, 'No trial dates → not claimed');
      },
    },

    {
      name: 'trial-not-claimed-when-only-start',
      async run({ assert }) {
        const result = toUnified({ trial_start: 1700000000 });
        assert.equal(result.trial.claimed, false, 'Only trial_start → not claimed');
      },
    },

    {
      name: 'trial-not-claimed-when-null-dates',
      async run({ assert }) {
        const result = toUnified({ trial_start: null, trial_end: null });
        assert.equal(result.trial.claimed, false, 'Null trial dates → not claimed');
      },
    },

    // ─── Cancellation resolution ───

    {
      name: 'cancellation-pending-when-cancel-at-period-end',
      async run({ assert }) {
        const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 30;
        const result = toUnified({
          cancel_at_period_end: true,
          cancel_at: futureTimestamp,
          current_period_end: futureTimestamp,
        });
        assert.equal(result.cancellation.pending, true, 'cancel_at_period_end → pending');
        assert.ok(result.cancellation.date.timestampUNIX > 0, 'Should have cancellation date');
      },
    },

    {
      name: 'cancellation-pending-uses-period-end-when-no-cancel-at',
      async run({ assert }) {
        const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 30;
        const result = toUnified({
          cancel_at_period_end: true,
          current_period_end: futureTimestamp,
        });
        assert.equal(result.cancellation.pending, true, 'Should be pending');
      },
    },

    {
      name: 'cancellation-already-cancelled',
      async run({ assert }) {
        const pastTimestamp = Math.floor(Date.now() / 1000) - 86400;
        const result = toUnified({
          cancel_at_period_end: false,
          canceled_at: pastTimestamp,
        });
        assert.equal(result.cancellation.pending, false, 'Already cancelled → not pending');
        assert.ok(result.cancellation.date.timestampUNIX > 0, 'Should have cancellation date');
      },
    },

    {
      name: 'cancellation-none',
      async run({ assert }) {
        const result = toUnified({
          cancel_at_period_end: false,
          canceled_at: null,
        });
        assert.equal(result.cancellation.pending, false, 'No cancellation → not pending');
      },
    },

    // ─── Expiration and start date ───

    {
      name: 'expires-from-period-end',
      async run({ assert }) {
        const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 30;
        const result = toUnified({ current_period_end: futureTimestamp });
        assert.ok(result.expires.timestampUNIX > 0, 'Should have expiration');
      },
    },

    {
      name: 'expires-defaults-to-epoch-when-missing',
      async run({ assert }) {
        const result = toUnified({});
        assert.equal(result.expires.timestampUNIX, 0, 'Missing period_end → epoch');
      },
    },

    {
      name: 'start-date-from-raw',
      async run({ assert }) {
        const startTimestamp = Math.floor(Date.now() / 1000) - 86400 * 30;
        const result = toUnified({ start_date: startTimestamp });
        assert.ok(result.payment.startDate.timestampUNIX > 0, 'Should have start date');
      },
    },

    {
      name: 'start-date-defaults-to-epoch-when-missing',
      async run({ assert }) {
        const result = toUnified({});
        assert.equal(result.payment.startDate.timestampUNIX, 0, 'Missing start_date → epoch');
      },
    },

    // ─── Payment metadata ───

    {
      name: 'payment-processor-always-stripe',
      async run({ assert }) {
        const result = toUnified({});
        assert.equal(result.payment.processor, 'stripe', 'Processor should always be stripe');
      },
    },

    {
      name: 'payment-resource-id-from-subscription-id',
      async run({ assert }) {
        const result = toUnified({ id: 'sub_abc123' });
        assert.equal(result.payment.resourceId, 'sub_abc123', 'resourceId should be subscription ID');
      },
    },

    {
      name: 'payment-resource-id-null-when-missing',
      async run({ assert }) {
        const result = toUnified({});
        assert.equal(result.payment.resourceId, null, 'Missing ID → null resourceId');
      },
    },

    {
      name: 'payment-event-metadata-passed-through',
      async run({ assert }) {
        const result = toUnified({}, { eventName: 'customer.subscription.created', eventId: 'evt_123' });
        assert.equal(result.payment.updatedBy.event.name, 'customer.subscription.created', 'Event name passed through');
        assert.equal(result.payment.updatedBy.event.id, 'evt_123', 'Event ID passed through');
      },
    },

    {
      name: 'payment-event-metadata-null-when-missing',
      async run({ assert }) {
        const result = toUnified({});
        assert.equal(result.payment.updatedBy.event.name, null, 'Missing event name → null');
        assert.equal(result.payment.updatedBy.event.id, null, 'Missing event ID → null');
      },
    },

    // ─── Full unified shape ───

    {
      name: 'full-active-subscription-shape',
      async run({ assert }) {
        const now = Math.floor(Date.now() / 1000);
        const result = toUnified({
          id: 'sub_full_test',
          status: 'active',
          plan: { id: 'price_pro_monthly', interval: 'month' },
          current_period_end: now + 86400 * 30,
          current_period_start: now,
          start_date: now - 86400 * 60,
          cancel_at_period_end: false,
          canceled_at: null,
          trial_start: null,
          trial_end: null,
        }, { eventName: 'customer.subscription.updated', eventId: 'evt_full' });

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
        assert.equal(result.payment.processor, 'stripe', 'Processor should be stripe');
        assert.equal(result.payment.resourceId, 'sub_full_test', 'Resource ID should match');
        assert.equal(result.payment.frequency, 'monthly', 'Frequency should be monthly');
        assert.equal(result.payment.updatedBy.event.name, 'customer.subscription.updated', 'Event name should match');
      },
    },

    {
      name: 'empty-subscription-gets-safe-defaults',
      async run({ assert }) {
        const result = toUnified({});

        assert.equal(result.product.id, 'basic', 'Empty → basic product');
        assert.equal(result.status, 'cancelled', 'Empty → cancelled (no status field)');
        assert.equal(result.trial.claimed, false, 'Empty → trial not claimed');
        assert.equal(result.cancellation.pending, false, 'Empty → not pending');
        assert.equal(result.payment.processor, 'stripe', 'Empty → still stripe');
        assert.equal(result.payment.resourceId, null, 'Empty → null resourceId');
        assert.equal(result.payment.frequency, null, 'Empty → null frequency');
      },
    },

    // ─── Real Stripe fixtures (via `stripe trigger`) ───

    {
      name: 'fixture-active-status',
      async run({ assert }) {
        const result = toUnified(FIXTURE_ACTIVE);
        assert.equal(result.status, 'active', 'Real active fixture → active');
        assert.equal(result.payment.processor, 'stripe', 'Processor is stripe');
        assert.equal(result.payment.resourceId, FIXTURE_ACTIVE.id, 'resourceId matches fixture ID');
      },
    },

    {
      name: 'fixture-active-frequency',
      async run({ assert }) {
        const result = toUnified(FIXTURE_ACTIVE);
        assert.equal(result.payment.frequency, 'monthly', 'Real active fixture → monthly');
      },
    },

    {
      name: 'fixture-active-dates',
      async run({ assert }) {
        const result = toUnified(FIXTURE_ACTIVE);
        assert.ok(result.expires.timestampUNIX > 0, 'Should have real expiration');
        assert.ok(result.payment.startDate.timestampUNIX > 0, 'Should have real start date');
        assert.equal(result.trial.claimed, false, 'No trial on active fixture');
        assert.equal(result.cancellation.pending, false, 'No cancellation on active fixture');
      },
    },

    {
      name: 'fixture-active-product-falls-back',
      async run({ assert }) {
        // Fixture price IDs won't match our mock config, so it should fall back to basic
        const result = toUnified(FIXTURE_ACTIVE);
        assert.equal(result.product.id, 'basic', 'Unknown price → basic fallback');
      },
    },

    {
      name: 'fixture-canceled-status',
      async run({ assert }) {
        const result = toUnified(FIXTURE_CANCELED);
        assert.equal(result.status, 'cancelled', 'Real canceled fixture → cancelled');
        assert.equal(result.cancellation.pending, false, 'Not pending — already cancelled');
        assert.ok(result.cancellation.date.timestampUNIX > 0, 'Should have cancellation date');
      },
    },

    {
      name: 'fixture-canceled-has-ended-at',
      async run({ assert }) {
        assert.ok(FIXTURE_CANCELED.ended_at, 'Canceled fixture should have ended_at');
        assert.ok(FIXTURE_CANCELED.canceled_at, 'Canceled fixture should have canceled_at');
        const result = toUnified(FIXTURE_CANCELED);
        assert.equal(result.payment.resourceId, FIXTURE_CANCELED.id, 'resourceId matches');
      },
    },

    {
      name: 'fixture-trialing-status',
      async run({ assert }) {
        const result = toUnified(FIXTURE_TRIALING);
        assert.equal(result.status, 'active', 'Real trialing fixture → active');
        assert.equal(result.trial.claimed, true, 'Trialing fixture → trial claimed');
        assert.ok(result.trial.expires.timestampUNIX > 0, 'Trial expiration should be set');
      },
    },

    {
      name: 'fixture-trialing-dates',
      async run({ assert }) {
        assert.ok(FIXTURE_TRIALING.trial_start, 'Trialing fixture should have trial_start');
        assert.ok(FIXTURE_TRIALING.trial_end, 'Trialing fixture should have trial_end');
        const result = toUnified(FIXTURE_TRIALING);
        assert.equal(result.cancellation.pending, false, 'No cancellation on trialing fixture');
        assert.equal(result.payment.frequency, 'monthly', 'Trialing fixture → monthly');
      },
    },

    {
      name: 'fixture-all-have-unified-shape',
      async run({ assert }) {
        const fixtures = [FIXTURE_ACTIVE, FIXTURE_CANCELED, FIXTURE_TRIALING];
        const names = ['active', 'canceled', 'trialing'];

        for (let i = 0; i < fixtures.length; i++) {
          const result = toUnified(fixtures[i]);
          const label = names[i];

          assert.ok(result.product, `${label}: should have product`);
          assert.ok(result.product.id, `${label}: should have product.id`);
          assert.ok(result.product.name, `${label}: should have product.name`);
          assert.isType(result.status, 'string', `${label}: status should be string`);
          assert.ok(result.expires, `${label}: should have expires`);
          assert.ok(result.trial, `${label}: should have trial`);
          assert.ok(result.cancellation, `${label}: should have cancellation`);
          assert.ok(result.payment, `${label}: should have payment`);
          assert.equal(result.payment.processor, 'stripe', `${label}: processor should be stripe`);
          assert.ok(result.payment.updatedBy, `${label}: should have updatedBy`);
          assert.ok(result.payment.updatedBy.date, `${label}: should have updatedBy.date`);
        }
      },
    },

    // ─── Combination / edge-case scenarios ───

    {
      name: 'combo-trialing-with-pending-cancel',
      async run({ assert }) {
        const now = Math.floor(Date.now() / 1000);
        const result = toUnified({
          id: 'sub_trial_cancel',
          status: 'trialing',
          trial_start: now - 86400 * 3,
          trial_end: now + 86400 * 11,
          cancel_at_period_end: true,
          cancel_at: now + 86400 * 11,
          canceled_at: null,
          current_period_end: now + 86400 * 11,
          start_date: now - 86400 * 3,
          plan: { id: 'price_plus_monthly', interval: 'month' },
        });

        assert.equal(result.status, 'active', 'Trialing + cancel → still active');
        assert.equal(result.trial.claimed, true, 'Trial should be claimed');
        assert.equal(result.cancellation.pending, true, 'Cancel should be pending');
        assert.ok(result.cancellation.date.timestampUNIX > 0, 'Should have cancel date');
      },
    },

    {
      name: 'combo-trial-payment-fails',
      async run({ assert }) {
        const now = Math.floor(Date.now() / 1000);
        const result = toUnified({
          id: 'sub_trial_fail',
          status: 'incomplete_expired',
          trial_start: now - 86400 * 14,
          trial_end: now - 86400,
          cancel_at_period_end: false,
          canceled_at: now,
          current_period_end: now - 86400,
          start_date: now - 86400 * 14,
          plan: { id: 'price_plus_monthly', interval: 'month' },
        });

        assert.equal(result.status, 'cancelled', 'Failed trial → cancelled');
        assert.equal(result.trial.claimed, true, 'Trial was still claimed');
        assert.equal(result.cancellation.pending, false, 'Not pending — already done');
        assert.ok(result.cancellation.date.timestampUNIX > 0, 'Should have cancellation date');
      },
    },

    {
      name: 'combo-active-with-past-trial',
      async run({ assert }) {
        const now = Math.floor(Date.now() / 1000);
        const result = toUnified({
          id: 'sub_past_trial',
          status: 'active',
          trial_start: now - 86400 * 30,
          trial_end: now - 86400 * 16,
          cancel_at_period_end: false,
          canceled_at: null,
          current_period_end: now + 86400 * 14,
          start_date: now - 86400 * 30,
          plan: { id: 'price_pro_monthly', interval: 'month' },
        });

        assert.equal(result.status, 'active', 'Active with past trial → active');
        assert.equal(result.trial.claimed, true, 'Past trial → still claimed');
        assert.equal(result.cancellation.pending, false, 'No cancellation');
        assert.equal(result.product.id, 'pro', 'Should resolve product');
      },
    },

    {
      name: 'combo-pending-cancel-reactivated',
      async run({ assert }) {
        const now = Math.floor(Date.now() / 1000);
        const result = toUnified({
          id: 'sub_reactivated',
          status: 'active',
          cancel_at_period_end: false,
          cancel_at: null,
          canceled_at: null,
          current_period_end: now + 86400 * 20,
          start_date: now - 86400 * 40,
          trial_start: null,
          trial_end: null,
          plan: { id: 'price_pro_monthly', interval: 'month' },
        });

        assert.equal(result.status, 'active', 'Reactivated → active');
        assert.equal(result.cancellation.pending, false, 'Cancel reverted → not pending');
      },
    },

    {
      name: 'combo-suspended-with-pending-cancel',
      async run({ assert }) {
        const now = Math.floor(Date.now() / 1000);
        const result = toUnified({
          id: 'sub_suspended_cancel',
          status: 'past_due',
          cancel_at_period_end: true,
          cancel_at: now + 86400 * 5,
          canceled_at: null,
          current_period_end: now + 86400 * 5,
          start_date: now - 86400 * 60,
          trial_start: null,
          trial_end: null,
          plan: { id: 'price_plus_monthly', interval: 'month' },
        });

        assert.equal(result.status, 'suspended', 'Past due → suspended');
        assert.equal(result.cancellation.pending, true, 'Cancel still pending');
      },
    },

    {
      name: 'combo-trialing-past-due',
      async run({ assert }) {
        const now = Math.floor(Date.now() / 1000);
        const result = toUnified({
          id: 'sub_trial_past_due',
          status: 'past_due',
          trial_start: now - 86400 * 14,
          trial_end: now - 86400,
          cancel_at_period_end: false,
          canceled_at: null,
          current_period_end: now + 86400,
          start_date: now - 86400 * 14,
          plan: { id: 'price_plus_monthly', interval: 'month' },
        });

        assert.equal(result.status, 'suspended', 'Trial ended + payment failed → suspended');
        assert.equal(result.trial.claimed, true, 'Trial was claimed');
        assert.equal(result.cancellation.pending, false, 'No cancellation pending');
      },
    },
  ],
};
