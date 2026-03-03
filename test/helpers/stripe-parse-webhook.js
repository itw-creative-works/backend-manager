/**
 * Test: Stripe parseWebhook()
 * Unit tests for the Stripe webhook processor's event categorization and routing
 *
 * Verifies that parseWebhook() correctly determines category, resourceType, resourceId,
 * and uid for each supported event type. Uses real Stripe CLI fixtures where available.
 */
const stripeProcessor = require('../../src/manager/routes/payments/webhook/processors/stripe.js');

// Real Stripe CLI fixtures
const FIXTURE_INVOICE_MANUAL = require('../fixtures/stripe/invoice-payment-failed.json');
const FIXTURE_CHECKOUT_PAYMENT = require('../fixtures/stripe/checkout-session-completed.json');

// Hand-crafted fixture (subscription-related invoice failure)
const FIXTURE_INVOICE_SUB = require('../fixtures/stripe/invoice-subscription-payment-failed.json');

function parseWebhook(event) {
  return stripeProcessor.parseWebhook({ body: event });
}

module.exports = {
  description: 'Stripe parseWebhook() event categorization',
  type: 'group',

  tests: [
    // ─── isSupported() ───

    {
      name: 'supports-subscription-created',
      async run({ assert }) {
        assert.ok(stripeProcessor.isSupported('customer.subscription.created'), 'Should support customer.subscription.created');
      },
    },

    {
      name: 'supports-subscription-updated',
      async run({ assert }) {
        assert.ok(stripeProcessor.isSupported('customer.subscription.updated'), 'Should support customer.subscription.updated');
      },
    },

    {
      name: 'supports-subscription-deleted',
      async run({ assert }) {
        assert.ok(stripeProcessor.isSupported('customer.subscription.deleted'), 'Should support customer.subscription.deleted');
      },
    },

    {
      name: 'supports-invoice-payment-failed',
      async run({ assert }) {
        assert.ok(stripeProcessor.isSupported('invoice.payment_failed'), 'Should support invoice.payment_failed');
      },
    },

    {
      name: 'supports-checkout-session-completed',
      async run({ assert }) {
        assert.ok(stripeProcessor.isSupported('checkout.session.completed'), 'Should support checkout.session.completed');
      },
    },

    {
      name: 'rejects-unsupported-event',
      async run({ assert }) {
        assert.equal(stripeProcessor.isSupported('charge.succeeded'), false, 'Should not support charge.succeeded');
        assert.equal(stripeProcessor.isSupported('customer.created'), false, 'Should not support customer.created');
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
          parseWebhook({ type: 'customer.subscription.updated', data: { object: {} } });
          assert.fail('Should have thrown');
        } catch (e) {
          assert.match(e.message, /Invalid/, 'Should mention invalid payload');
        }
      },
    },

    {
      name: 'throws-on-missing-type',
      async run({ assert }) {
        try {
          parseWebhook({ id: 'evt_123', data: { object: {} } });
          assert.fail('Should have thrown');
        } catch (e) {
          assert.match(e.message, /Invalid/, 'Should mention invalid payload');
        }
      },
    },

    // ─── customer.subscription.* events ───

    {
      name: 'subscription-created-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_sub_created',
          type: 'customer.subscription.created',
          data: { object: { id: 'sub_123', metadata: { uid: 'user-abc' } } },
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.resourceType, 'subscription', 'Resource type should be subscription');
        assert.equal(result.resourceId, 'sub_123', 'Resource ID should be subscription ID');
        assert.equal(result.uid, 'user-abc', 'UID should come from metadata');
        assert.equal(result.eventId, 'evt_sub_created', 'Event ID should match');
        assert.equal(result.eventType, 'customer.subscription.created', 'Event type should match');
      },
    },

    {
      name: 'subscription-updated-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_sub_updated',
          type: 'customer.subscription.updated',
          data: { object: { id: 'sub_456', metadata: { uid: 'user-def' } } },
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.resourceType, 'subscription', 'Resource type should be subscription');
        assert.equal(result.resourceId, 'sub_456', 'Resource ID should match');
        assert.equal(result.uid, 'user-def', 'UID should match');
      },
    },

    {
      name: 'subscription-deleted-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_sub_deleted',
          type: 'customer.subscription.deleted',
          data: { object: { id: 'sub_789', metadata: { uid: 'user-ghi' } } },
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.resourceType, 'subscription', 'Resource type should be subscription');
        assert.equal(result.resourceId, 'sub_789', 'Resource ID should match');
        assert.equal(result.uid, 'user-ghi', 'UID should match');
      },
    },

    {
      name: 'subscription-event-null-uid-when-missing-metadata',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_no_uid',
          type: 'customer.subscription.created',
          data: { object: { id: 'sub_no_uid', metadata: {} } },
        });

        assert.equal(result.uid, null, 'UID should be null when not in metadata');
        assert.equal(result.category, 'subscription', 'Category should still be subscription');
      },
    },

    // ─── invoice.payment_failed — subscription-related ───

    {
      name: 'invoice-sub-failure-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_inv_sub_fail',
          type: 'invoice.payment_failed',
          data: {
            object: {
              id: 'in_sub_fail',
              billing_reason: 'subscription_cycle',
              parent: {
                subscription_details: {
                  subscription: 'sub_target',
                  metadata: { uid: 'user-sub-fail' },
                },
              },
            },
          },
        });

        assert.equal(result.category, 'subscription', 'Subscription invoice failure → subscription category');
        assert.equal(result.resourceType, 'subscription', 'Should fetch the subscription, not the invoice');
        assert.equal(result.resourceId, 'sub_target', 'Resource ID should be the subscription ID');
        assert.equal(result.uid, 'user-sub-fail', 'UID should come from subscription metadata');
      },
    },

    {
      name: 'invoice-sub-failure-from-fixture',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_fixture_sub_fail',
          type: 'invoice.payment_failed',
          data: { object: FIXTURE_INVOICE_SUB },
        });

        assert.equal(result.category, 'subscription', 'Fixture: should be subscription category');
        assert.equal(result.resourceType, 'subscription', 'Fixture: should fetch subscription');
        assert.equal(result.resourceId, 'sub_test_failed_sub', 'Fixture: resource ID from parent.subscription_details');
        assert.equal(result.uid, 'test-uid-sub-fail', 'Fixture: UID from subscription metadata');
      },
    },

    {
      name: 'invoice-sub-failure-subscription-create-reason',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_inv_sub_create',
          type: 'invoice.payment_failed',
          data: {
            object: {
              id: 'in_sub_create_fail',
              billing_reason: 'subscription_create',
              parent: {
                subscription_details: {
                  subscription: 'sub_new',
                  metadata: { uid: 'user-new' },
                },
              },
            },
          },
        });

        assert.equal(result.category, 'subscription', 'subscription_create billing reason → subscription');
        assert.equal(result.resourceId, 'sub_new', 'Should use subscription ID');
      },
    },

    {
      name: 'invoice-sub-failure-legacy-subscription-field',
      async run({ assert }) {
        // Older Stripe API versions use data.object.subscription instead of parent
        const result = parseWebhook({
          id: 'evt_inv_legacy',
          type: 'invoice.payment_failed',
          data: {
            object: {
              id: 'in_legacy',
              billing_reason: 'subscription_cycle',
              subscription: 'sub_legacy',
              metadata: { uid: 'user-legacy' },
            },
          },
        });

        assert.equal(result.category, 'subscription', 'Legacy format → subscription');
        assert.equal(result.resourceType, 'subscription', 'Should still fetch subscription');
        assert.equal(result.resourceId, 'sub_legacy', 'Should use legacy subscription field');
        assert.equal(result.uid, 'user-legacy', 'UID falls back to invoice metadata');
      },
    },

    // ─── invoice.payment_failed — one-time ───

    {
      name: 'invoice-onetime-failure-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_inv_manual_fail',
          type: 'invoice.payment_failed',
          data: {
            object: {
              id: 'in_manual_fail',
              billing_reason: 'manual',
              metadata: { uid: 'user-manual' },
            },
          },
        });

        assert.equal(result.category, 'one-time', 'Manual billing reason → one-time');
        assert.equal(result.resourceType, 'invoice', 'Should fetch the invoice');
        assert.equal(result.resourceId, 'in_manual_fail', 'Resource ID should be invoice ID');
        assert.equal(result.uid, 'user-manual', 'UID from invoice metadata');
      },
    },

    {
      name: 'invoice-onetime-failure-from-fixture',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_fixture_manual',
          type: 'invoice.payment_failed',
          data: { object: FIXTURE_INVOICE_MANUAL },
        });

        assert.equal(result.category, 'one-time', 'Fixture: manual billing → one-time');
        assert.equal(result.resourceType, 'invoice', 'Fixture: should fetch invoice');
        assert.equal(result.resourceId, FIXTURE_INVOICE_MANUAL.id, 'Fixture: resource ID is invoice ID');
        assert.equal(result.uid, null, 'Fixture: no uid in metadata (CLI-generated)');
      },
    },

    {
      name: 'invoice-failure-no-billing-reason-defaults-to-onetime',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_inv_no_reason',
          type: 'invoice.payment_failed',
          data: {
            object: {
              id: 'in_no_reason',
              metadata: { uid: 'user-no-reason' },
            },
          },
        });

        assert.equal(result.category, 'one-time', 'No billing reason → one-time');
        assert.equal(result.resourceType, 'invoice', 'Should fetch invoice');
      },
    },

    // ─── checkout.session.completed — one-time payment ───

    {
      name: 'checkout-payment-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_cs_payment',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_payment',
              mode: 'payment',
              metadata: { uid: 'user-checkout' },
            },
          },
        });

        assert.equal(result.category, 'one-time', 'Payment mode → one-time');
        assert.equal(result.resourceType, 'session', 'Should fetch session');
        assert.equal(result.resourceId, 'cs_test_payment', 'Resource ID should be session ID');
        assert.equal(result.uid, 'user-checkout', 'UID from session metadata');
      },
    },

    {
      name: 'checkout-payment-from-fixture',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_fixture_checkout',
          type: 'checkout.session.completed',
          data: { object: FIXTURE_CHECKOUT_PAYMENT },
        });

        assert.equal(result.category, 'one-time', 'Fixture: payment mode → one-time');
        assert.equal(result.resourceType, 'session', 'Fixture: should fetch session');
        assert.equal(result.resourceId, FIXTURE_CHECKOUT_PAYMENT.id, 'Fixture: resource ID is session ID');
        assert.equal(result.uid, null, 'Fixture: no uid in metadata (CLI-generated)');
      },
    },

    // ─── checkout.session.completed — subscription mode (skipped) ───

    {
      name: 'checkout-subscription-skipped',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_cs_sub',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_sub',
              mode: 'subscription',
              metadata: { uid: 'user-cs-sub' },
            },
          },
        });

        assert.equal(result.category, null, 'Subscription checkout → null (skipped)');
        assert.equal(result.resourceType, null, 'No resource type for skipped events');
        assert.equal(result.resourceId, null, 'No resource ID for skipped events');
      },
    },

    {
      name: 'checkout-unknown-mode-skipped',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_cs_unknown',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_unknown',
              mode: 'setup',
              metadata: {},
            },
          },
        });

        assert.equal(result.category, null, 'Unknown checkout mode → null');
      },
    },

    // ─── Unsupported event type passthrough ───

    {
      name: 'unsupported-event-returns-null-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'evt_unsupported',
          type: 'charge.succeeded',
          data: { object: { id: 'ch_123' } },
        });

        assert.equal(result.category, null, 'Unsupported event → null category');
        assert.equal(result.resourceType, null, 'No resource type');
        assert.equal(result.resourceId, null, 'No resource ID');
        assert.equal(result.eventId, 'evt_unsupported', 'Should still return event ID');
        assert.equal(result.eventType, 'charge.succeeded', 'Should still return event type');
      },
    },

    // ─── raw passthrough ───

    {
      name: 'raw-contains-full-event',
      async run({ assert }) {
        const event = {
          id: 'evt_raw',
          type: 'customer.subscription.updated',
          data: { object: { id: 'sub_raw', metadata: { uid: 'user-raw' } } },
          extra_field: 'preserved',
        };

        const result = parseWebhook(event);
        assert.equal(result.raw, event, 'Raw should be the full event object');
        assert.equal(result.raw.extra_field, 'preserved', 'Extra fields preserved in raw');
      },
    },
  ],
};
