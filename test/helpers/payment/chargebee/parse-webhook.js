/**
 * Test: Chargebee parseWebhook()
 * Unit tests for the Chargebee webhook processor's event categorization and routing
 *
 * Verifies that parseWebhook() correctly determines category, resourceType, resourceId,
 * and uid for each supported event type.
 */
const chargebeeProcessor = require('../../../../src/manager/routes/payments/webhook/processors/chargebee.js');

// Chargebee webhook fixtures
const FIXTURE_SUB_CREATED = require('../../../fixtures/chargebee/webhook-subscription-created.json');
const FIXTURE_PAYMENT_FAILED = require('../../../fixtures/chargebee/webhook-payment-failed.json');

function parseWebhook(event) {
  return chargebeeProcessor.parseWebhook({ body: event });
}

module.exports = {
  description: 'Chargebee parseWebhook() event categorization',
  type: 'group',

  tests: [
    // ─── isSupported() ───

    {
      name: 'supports-subscription-created',
      async run({ assert }) {
        assert.ok(chargebeeProcessor.isSupported('subscription_created'), 'Should support subscription_created');
      },
    },

    {
      name: 'supports-subscription-cancelled',
      async run({ assert }) {
        assert.ok(chargebeeProcessor.isSupported('subscription_cancelled'), 'Should support subscription_cancelled');
      },
    },

    {
      name: 'supports-subscription-activated',
      async run({ assert }) {
        assert.ok(chargebeeProcessor.isSupported('subscription_activated'), 'Should support subscription_activated');
      },
    },

    {
      name: 'supports-subscription-changed',
      async run({ assert }) {
        assert.ok(chargebeeProcessor.isSupported('subscription_changed'), 'Should support subscription_changed');
      },
    },

    {
      name: 'supports-subscription-renewed',
      async run({ assert }) {
        assert.ok(chargebeeProcessor.isSupported('subscription_renewed'), 'Should support subscription_renewed');
      },
    },

    {
      name: 'supports-subscription-reactivated',
      async run({ assert }) {
        assert.ok(chargebeeProcessor.isSupported('subscription_reactivated'), 'Should support subscription_reactivated');
      },
    },

    {
      name: 'supports-cancellation-scheduled',
      async run({ assert }) {
        assert.ok(chargebeeProcessor.isSupported('subscription_cancellation_scheduled'), 'Should support subscription_cancellation_scheduled');
      },
    },

    {
      name: 'supports-cancellation-removed',
      async run({ assert }) {
        assert.ok(chargebeeProcessor.isSupported('subscription_scheduled_cancellation_removed'), 'Should support scheduled_cancellation_removed');
      },
    },

    {
      name: 'supports-payment-failed',
      async run({ assert }) {
        assert.ok(chargebeeProcessor.isSupported('payment_failed'), 'Should support payment_failed');
      },
    },

    {
      name: 'supports-payment-refunded',
      async run({ assert }) {
        assert.ok(chargebeeProcessor.isSupported('payment_refunded'), 'Should support payment_refunded');
      },
    },

    {
      name: 'supports-invoice-generated',
      async run({ assert }) {
        assert.ok(chargebeeProcessor.isSupported('invoice_generated'), 'Should support invoice_generated');
      },
    },

    {
      name: 'rejects-unsupported-event',
      async run({ assert }) {
        assert.equal(chargebeeProcessor.isSupported('customer_created'), false, 'Should not support customer_created');
        assert.equal(chargebeeProcessor.isSupported('coupon_created'), false, 'Should not support coupon_created');
        assert.equal(chargebeeProcessor.isSupported('subscription_deleted'), false, 'Should not support subscription_deleted');
      },
    },

    // ─── Validation ───

    {
      name: 'throws-on-empty-body',
      async run({ assert }) {
        try {
          parseWebhook(null);
          assert.fail('Should have thrown');
        } catch (e) {
          assert.match(e.message, /Invalid/, 'Should mention invalid payload');
        }
      },
    },

    {
      name: 'throws-on-missing-id',
      async run({ assert }) {
        try {
          parseWebhook({ event_type: 'subscription_created', content: {} });
          assert.fail('Should have thrown');
        } catch (e) {
          assert.match(e.message, /Invalid/, 'Should mention invalid payload');
        }
      },
    },

    {
      name: 'throws-on-missing-event-type',
      async run({ assert }) {
        try {
          parseWebhook({ id: 'ev_123', content: {} });
          assert.fail('Should have thrown');
        } catch (e) {
          assert.match(e.message, /Invalid/, 'Should mention invalid payload');
        }
      },
    },

    // ─── Subscription events ───

    {
      name: 'subscription-created-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'ev_sub_created',
          event_type: 'subscription_created',
          content: {
            subscription: {
              id: 'sub_123',
              meta_data: '{"uid":"user-abc"}',
            },
            customer: { id: 'cust_123' },
          },
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.resourceType, 'subscription', 'Resource type should be subscription');
        assert.equal(result.resourceId, 'sub_123', 'Resource ID should be subscription ID');
        assert.equal(result.uid, 'user-abc', 'UID should come from meta_data');
        assert.equal(result.eventId, 'ev_sub_created', 'Event ID should match');
        assert.equal(result.eventType, 'subscription_created', 'Event type should match');
      },
    },

    {
      name: 'subscription-cancelled-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'ev_sub_cancelled',
          event_type: 'subscription_cancelled',
          content: {
            subscription: {
              id: 'sub_456',
              meta_data: '{"uid":"user-def"}',
            },
          },
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.resourceId, 'sub_456', 'Resource ID should match');
        assert.equal(result.uid, 'user-def', 'UID should match');
      },
    },

    {
      name: 'subscription-cancellation-scheduled-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'ev_cancel_scheduled',
          event_type: 'subscription_cancellation_scheduled',
          content: {
            subscription: {
              id: 'sub_789',
              meta_data: '{"uid":"user-ghi"}',
              status: 'non_renewing',
            },
          },
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.uid, 'user-ghi', 'UID should match');
      },
    },

    {
      name: 'subscription-event-uid-from-legacy-cf',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'ev_legacy_uid',
          event_type: 'subscription_renewed',
          content: {
            subscription: {
              id: 'sub_legacy',
              cf_uid: 'legacy-user-123',
            },
          },
        });

        assert.equal(result.uid, 'legacy-user-123', 'UID should fall back to cf_uid');
      },
    },

    {
      name: 'subscription-event-null-uid-when-missing',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'ev_no_uid',
          event_type: 'subscription_created',
          content: {
            subscription: { id: 'sub_no_uid' },
          },
        });

        assert.equal(result.uid, null, 'UID should be null when not available');
        assert.equal(result.category, 'subscription', 'Category should still be subscription');
      },
    },

    // ─── payment_failed ───

    {
      name: 'payment-failed-subscription-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'ev_pay_fail',
          event_type: 'payment_failed',
          content: {
            subscription: {
              id: 'sub_fail',
              meta_data: '{"uid":"user-fail"}',
            },
            invoice: { id: 'inv_fail', subscription_id: 'sub_fail' },
          },
        });

        assert.equal(result.category, 'subscription', 'With subscription → subscription category');
        assert.equal(result.resourceType, 'subscription', 'Should fetch subscription');
        assert.equal(result.resourceId, 'sub_fail', 'Resource ID should be subscription ID');
        assert.equal(result.uid, 'user-fail', 'UID from subscription');
      },
    },

    {
      name: 'payment-failed-one-time-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'ev_pay_fail_onetime',
          event_type: 'payment_failed',
          content: {
            invoice: { id: 'inv_onetime_fail' },
            customer: { id: 'cust_onetime' },
          },
        });

        assert.equal(result.category, 'one-time', 'No subscription → one-time');
        assert.equal(result.resourceType, 'invoice', 'Should fetch invoice');
        assert.equal(result.resourceId, 'inv_onetime_fail', 'Resource ID should be invoice ID');
      },
    },

    // ─── payment_refunded ───

    {
      name: 'payment-refunded-subscription-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'ev_refund',
          event_type: 'payment_refunded',
          content: {
            subscription: {
              id: 'sub_refund',
              meta_data: '{"uid":"user-refund"}',
            },
          },
        });

        assert.equal(result.category, 'subscription', 'With subscription → subscription');
        assert.equal(result.resourceId, 'sub_refund', 'Resource ID should be subscription');
        assert.equal(result.uid, 'user-refund', 'UID from subscription');
      },
    },

    {
      name: 'payment-refunded-no-subscription-skipped',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'ev_refund_no_sub',
          event_type: 'payment_refunded',
          content: {
            transaction: { id: 'txn_refund' },
          },
        });

        assert.equal(result.category, null, 'No subscription → null (skipped)');
      },
    },

    // ─── invoice_generated ───

    {
      name: 'invoice-generated-non-recurring-one-time',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'ev_inv_gen',
          event_type: 'invoice_generated',
          content: {
            invoice: { id: 'inv_onetime_001' },
            customer: { id: 'cust_onetime' },
          },
        });

        assert.equal(result.category, 'one-time', 'Non-recurring invoice → one-time');
        assert.equal(result.resourceType, 'invoice', 'Should fetch invoice');
        assert.equal(result.resourceId, 'inv_onetime_001', 'Resource ID should be invoice ID');
      },
    },

    {
      name: 'invoice-generated-recurring-skipped',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'ev_inv_recurring',
          event_type: 'invoice_generated',
          content: {
            invoice: { id: 'inv_recurring', subscription_id: 'sub_existing' },
          },
        });

        assert.equal(result.category, null, 'Recurring invoice → null (skipped)');
      },
    },

    // ─── Fixture tests ───

    {
      name: 'fixture-subscription-created',
      async run({ assert }) {
        const result = parseWebhook(FIXTURE_SUB_CREATED);

        assert.equal(result.eventId, FIXTURE_SUB_CREATED.id, 'Event ID matches fixture');
        assert.equal(result.eventType, 'subscription_created', 'Event type matches');
        assert.equal(result.category, 'subscription', 'Category is subscription');
        assert.equal(result.resourceType, 'subscription', 'Resource type is subscription');
        assert.equal(result.resourceId, 'cb_sub_active_001', 'Resource ID from content.subscription.id');
        assert.equal(result.uid, 'test-uid-001', 'UID from meta_data');
      },
    },

    {
      name: 'fixture-payment-failed',
      async run({ assert }) {
        const result = parseWebhook(FIXTURE_PAYMENT_FAILED);

        assert.equal(result.eventId, FIXTURE_PAYMENT_FAILED.id, 'Event ID matches fixture');
        assert.equal(result.eventType, 'payment_failed', 'Event type matches');
        assert.equal(result.category, 'subscription', 'Category is subscription (has subscription)');
        assert.equal(result.resourceType, 'subscription', 'Resource type is subscription');
        assert.equal(result.resourceId, 'cb_sub_active_001', 'Resource ID from content.subscription.id');
        assert.equal(result.uid, 'test-uid-001', 'UID from subscription meta_data');
      },
    },

    // ─── raw passthrough ───

    {
      name: 'raw-contains-full-event',
      async run({ assert }) {
        const event = {
          id: 'ev_raw',
          event_type: 'subscription_changed',
          content: {
            subscription: { id: 'sub_raw', meta_data: '{"uid":"user-raw"}' },
          },
          extra_field: 'preserved',
        };

        const result = parseWebhook(event);
        assert.equal(result.raw, event, 'Raw should be the full event object');
        assert.equal(result.raw.extra_field, 'preserved', 'Extra fields preserved in raw');
      },
    },
  ],
};
