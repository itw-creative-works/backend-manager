/**
 * Test: PayPal parseWebhook()
 * Unit tests for the PayPal webhook processor's event categorization and routing
 *
 * Verifies that parseWebhook() correctly determines category, resourceType, resourceId,
 * and uid for each supported event type. Mirrors stripe-parse-webhook.js for consistent coverage.
 */
const paypalProcessor = require('../../../../src/manager/routes/payments/webhook/processors/paypal.js');

// Real PayPal sandbox fixtures
const FIXTURE_ORDER_APPROVED = require('../../../fixtures/paypal/order-approved.json');
const FIXTURE_SUBSCRIPTION_ACTIVE = require('../../../fixtures/paypal/subscription-active.json');

function parseWebhook(event) {
  return paypalProcessor.parseWebhook({ body: event });
}

module.exports = {
  description: 'PayPal parseWebhook() event categorization',
  type: 'group',

  tests: [
    // ─── isSupported() ───

    {
      name: 'supports-subscription-activated',
      async run({ assert }) {
        assert.ok(paypalProcessor.isSupported('BILLING.SUBSCRIPTION.ACTIVATED'), 'Should support BILLING.SUBSCRIPTION.ACTIVATED');
      },
    },

    {
      name: 'supports-subscription-updated',
      async run({ assert }) {
        assert.ok(paypalProcessor.isSupported('BILLING.SUBSCRIPTION.UPDATED'), 'Should support BILLING.SUBSCRIPTION.UPDATED');
      },
    },

    {
      name: 'supports-subscription-cancelled',
      async run({ assert }) {
        assert.ok(paypalProcessor.isSupported('BILLING.SUBSCRIPTION.CANCELLED'), 'Should support BILLING.SUBSCRIPTION.CANCELLED');
      },
    },

    {
      name: 'supports-subscription-suspended',
      async run({ assert }) {
        assert.ok(paypalProcessor.isSupported('BILLING.SUBSCRIPTION.SUSPENDED'), 'Should support BILLING.SUBSCRIPTION.SUSPENDED');
      },
    },

    {
      name: 'supports-subscription-expired',
      async run({ assert }) {
        assert.ok(paypalProcessor.isSupported('BILLING.SUBSCRIPTION.EXPIRED'), 'Should support BILLING.SUBSCRIPTION.EXPIRED');
      },
    },

    {
      name: 'supports-subscription-reactivated',
      async run({ assert }) {
        assert.ok(paypalProcessor.isSupported('BILLING.SUBSCRIPTION.RE-ACTIVATED'), 'Should support BILLING.SUBSCRIPTION.RE-ACTIVATED');
      },
    },

    {
      name: 'supports-payment-sale-completed',
      async run({ assert }) {
        assert.ok(paypalProcessor.isSupported('PAYMENT.SALE.COMPLETED'), 'Should support PAYMENT.SALE.COMPLETED');
      },
    },

    {
      name: 'supports-payment-sale-denied',
      async run({ assert }) {
        assert.ok(paypalProcessor.isSupported('PAYMENT.SALE.DENIED'), 'Should support PAYMENT.SALE.DENIED');
      },
    },

    {
      name: 'supports-payment-sale-refunded',
      async run({ assert }) {
        assert.ok(paypalProcessor.isSupported('PAYMENT.SALE.REFUNDED'), 'Should support PAYMENT.SALE.REFUNDED');
      },
    },

    {
      name: 'supports-checkout-order-approved',
      async run({ assert }) {
        assert.ok(paypalProcessor.isSupported('CHECKOUT.ORDER.APPROVED'), 'Should support CHECKOUT.ORDER.APPROVED');
      },
    },

    {
      name: 'rejects-unsupported-event',
      async run({ assert }) {
        assert.equal(paypalProcessor.isSupported('PAYMENT.ORDER.CREATED'), false, 'Should not support PAYMENT.ORDER.CREATED');
        assert.equal(paypalProcessor.isSupported('CUSTOMER.CREATED'), false, 'Should not support CUSTOMER.CREATED');
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
          parseWebhook({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: {} });
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
          parseWebhook({ id: 'WH-123', resource: {} });
          assert.fail('Should have thrown');
        } catch (e) {
          assert.match(e.message, /Invalid/, 'Should mention invalid payload');
        }
      },
    },

    // ─── BILLING.SUBSCRIPTION.* events ───

    {
      name: 'subscription-activated-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-activated',
          event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
          resource: { id: 'I-SUB123', custom_id: 'uid:user-abc,orderId:ord-1' },
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.resourceType, 'subscription', 'Resource type should be subscription');
        assert.equal(result.resourceId, 'I-SUB123', 'Resource ID should be subscription ID');
        assert.equal(result.uid, 'user-abc', 'UID should come from custom_id');
        assert.equal(result.eventId, 'WH-activated', 'Event ID should match');
        assert.equal(result.eventType, 'BILLING.SUBSCRIPTION.ACTIVATED', 'Event type should match');
      },
    },

    {
      name: 'subscription-updated-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-updated',
          event_type: 'BILLING.SUBSCRIPTION.UPDATED',
          resource: { id: 'I-SUB456', custom_id: 'uid:user-def,orderId:ord-2' },
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.resourceType, 'subscription', 'Resource type should be subscription');
        assert.equal(result.resourceId, 'I-SUB456', 'Resource ID should match');
        assert.equal(result.uid, 'user-def', 'UID should match');
      },
    },

    {
      name: 'subscription-cancelled-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-cancelled',
          event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
          resource: { id: 'I-SUB789', custom_id: 'uid:user-ghi,orderId:ord-3' },
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.resourceType, 'subscription', 'Resource type should be subscription');
        assert.equal(result.resourceId, 'I-SUB789', 'Resource ID should match');
        assert.equal(result.uid, 'user-ghi', 'UID should match');
      },
    },

    {
      name: 'subscription-suspended-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-suspended',
          event_type: 'BILLING.SUBSCRIPTION.SUSPENDED',
          resource: { id: 'I-SUSPENDED', custom_id: 'uid:user-sus,orderId:ord-4' },
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.resourceType, 'subscription', 'Resource type should be subscription');
        assert.equal(result.resourceId, 'I-SUSPENDED', 'Resource ID should match');
        assert.equal(result.uid, 'user-sus', 'UID should match');
      },
    },

    {
      name: 'subscription-expired-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-expired',
          event_type: 'BILLING.SUBSCRIPTION.EXPIRED',
          resource: { id: 'I-EXPIRED', custom_id: 'uid:user-exp,orderId:ord-5' },
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.resourceId, 'I-EXPIRED', 'Resource ID should match');
        assert.equal(result.uid, 'user-exp', 'UID should match');
      },
    },

    {
      name: 'subscription-reactivated-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-reactivated',
          event_type: 'BILLING.SUBSCRIPTION.RE-ACTIVATED',
          resource: { id: 'I-REACTIVATED', custom_id: 'uid:user-re,orderId:ord-6' },
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.resourceId, 'I-REACTIVATED', 'Resource ID should match');
        assert.equal(result.uid, 'user-re', 'UID should match');
      },
    },

    {
      name: 'subscription-event-null-uid-when-no-custom-id',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-no-uid',
          event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
          resource: { id: 'I-NO-UID' },
        });

        assert.equal(result.uid, null, 'UID should be null when no custom_id');
        assert.equal(result.category, 'subscription', 'Category should still be subscription');
      },
    },

    {
      name: 'subscription-event-null-uid-when-empty-custom-id',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-empty-uid',
          event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
          resource: { id: 'I-EMPTY-UID', custom_id: '' },
        });

        assert.equal(result.uid, null, 'UID should be null when custom_id is empty');
      },
    },

    // ─── PAYMENT.SALE.COMPLETED — subscription payment ───

    {
      name: 'sale-completed-subscription-payment',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-sale-sub',
          event_type: 'PAYMENT.SALE.COMPLETED',
          resource: {
            id: 'SALE-123',
            billing_agreement_id: 'I-SUB-BILLING',
            custom_id: 'uid:user-sale,orderId:ord-sale',
          },
        });

        assert.equal(result.category, 'subscription', 'Subscription sale → subscription category');
        assert.equal(result.resourceType, 'subscription', 'Should fetch subscription, not sale');
        assert.equal(result.resourceId, 'I-SUB-BILLING', 'Resource ID should be the subscription ID');
        assert.equal(result.uid, 'user-sale', 'UID from custom_id');
      },
    },

    {
      name: 'sale-completed-no-billing-agreement-skipped',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-sale-onetime',
          event_type: 'PAYMENT.SALE.COMPLETED',
          resource: {
            id: 'SALE-456',
            // No billing_agreement_id → not a subscription payment
          },
        });

        assert.equal(result.category, null, 'No billing agreement → null category (skipped)');
        assert.equal(result.resourceType, null, 'No resource type');
        assert.equal(result.resourceId, null, 'No resource ID');
      },
    },

    // ─── PAYMENT.SALE.DENIED — subscription payment failure ───

    {
      name: 'sale-denied-subscription-payment',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-sale-denied',
          event_type: 'PAYMENT.SALE.DENIED',
          resource: {
            id: 'SALE-DENIED',
            billing_agreement_id: 'I-SUB-DENIED',
            custom_id: 'uid:user-denied,orderId:ord-denied',
          },
        });

        assert.equal(result.category, 'subscription', 'Denied subscription sale → subscription');
        assert.equal(result.resourceType, 'subscription', 'Should fetch subscription');
        assert.equal(result.resourceId, 'I-SUB-DENIED', 'Resource ID should be subscription ID');
        assert.equal(result.uid, 'user-denied', 'UID from custom_id');
      },
    },

    {
      name: 'sale-denied-no-billing-agreement-skipped',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-sale-denied-onetime',
          event_type: 'PAYMENT.SALE.DENIED',
          resource: { id: 'SALE-DENIED-OT' },
        });

        assert.equal(result.category, null, 'No billing agreement → null (skipped)');
      },
    },

    // ─── PAYMENT.SALE.REFUNDED ───

    {
      name: 'sale-refunded-subscription-linked',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-refund-sub',
          event_type: 'PAYMENT.SALE.REFUNDED',
          resource: {
            id: 'REFUND-123',
            billing_agreement_id: 'I-SUB-REFUND',
            custom_id: 'uid:user-refund,orderId:ord-refund',
          },
        });

        assert.equal(result.category, 'subscription', 'Subscription refund → subscription');
        assert.equal(result.resourceType, 'subscription', 'Should fetch subscription');
        assert.equal(result.resourceId, 'I-SUB-REFUND', 'Resource ID should be subscription ID');
        assert.equal(result.uid, 'user-refund', 'UID from custom_id');
      },
    },

    {
      name: 'sale-refunded-no-billing-agreement-skipped',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-refund-onetime',
          event_type: 'PAYMENT.SALE.REFUNDED',
          resource: { id: 'REFUND-OT' },
        });

        assert.equal(result.category, null, 'No billing agreement → null (skipped)');
      },
    },

    // ─── CHECKOUT.ORDER.APPROVED — one-time order ───

    {
      name: 'order-approved-one-time',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-order-approved',
          event_type: 'CHECKOUT.ORDER.APPROVED',
          resource: {
            id: 'ORDER-123',
            purchase_units: [{
              custom_id: 'uid:user-order,orderId:ord-order,productId:credits-100',
            }],
          },
        });

        assert.equal(result.category, 'one-time', 'Category should be one-time');
        assert.equal(result.resourceType, 'order', 'Resource type should be order');
        assert.equal(result.resourceId, 'ORDER-123', 'Resource ID should be the order ID');
        assert.equal(result.uid, 'user-order', 'UID should come from purchase_units custom_id');
        assert.equal(result.eventType, 'CHECKOUT.ORDER.APPROVED', 'Event type should match');
      },
    },

    {
      name: 'order-approved-null-uid-when-no-purchase-units',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-order-no-units',
          event_type: 'CHECKOUT.ORDER.APPROVED',
          resource: { id: 'ORDER-NO-UNITS' },
        });

        assert.equal(result.category, 'one-time', 'Category should still be one-time');
        assert.equal(result.resourceType, 'order', 'Resource type should be order');
        assert.equal(result.uid, null, 'UID should be null when no purchase_units');
      },
    },

    {
      name: 'order-approved-null-uid-when-empty-custom-id',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-order-empty',
          event_type: 'CHECKOUT.ORDER.APPROVED',
          resource: {
            id: 'ORDER-EMPTY',
            purchase_units: [{ custom_id: '' }],
          },
        });

        assert.equal(result.uid, null, 'UID should be null when custom_id is empty');
        assert.equal(result.category, 'one-time', 'Category should still be one-time');
      },
    },

    // ─── Custom ID parsing edge cases ───

    {
      name: 'custom-id-with-colon-in-uid',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-colon',
          event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
          resource: {
            id: 'I-COLON',
            custom_id: 'uid:firebase:auth:user123,orderId:ord-c',
          },
        });

        assert.equal(result.uid, 'firebase:auth:user123', 'Should handle colons in uid value');
      },
    },

    {
      name: 'custom-id-uid-only',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-uid-only',
          event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
          resource: {
            id: 'I-UID-ONLY',
            custom_id: 'uid:user-only',
          },
        });

        assert.equal(result.uid, 'user-only', 'Should parse uid without orderId');
      },
    },

    // ─── Raw passthrough ───

    {
      name: 'raw-contains-full-event',
      async run({ assert }) {
        const event = {
          id: 'WH-raw',
          event_type: 'BILLING.SUBSCRIPTION.UPDATED',
          resource: { id: 'I-RAW', custom_id: 'uid:user-raw,orderId:ord-raw' },
          extra_field: 'preserved',
        };

        const result = parseWebhook(event);
        assert.equal(result.raw, event, 'Raw should be the full event object');
        assert.equal(result.raw.extra_field, 'preserved', 'Extra fields preserved in raw');
      },
    },

    // ─── Unsupported event type passthrough ───

    {
      name: 'unsupported-event-returns-null-category',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-unsupported',
          event_type: 'PAYMENT.ORDER.CREATED',
          resource: { id: 'ORDER-123' },
        });

        assert.equal(result.category, null, 'Unsupported event → null category');
        assert.equal(result.resourceType, null, 'No resource type');
        assert.equal(result.resourceId, null, 'No resource ID');
        assert.equal(result.eventId, 'WH-unsupported', 'Should still return event ID');
        assert.equal(result.eventType, 'PAYMENT.ORDER.CREATED', 'Should still return event type');
      },
    },

    // ─── Real PayPal sandbox fixtures ───

    {
      name: 'fixture-subscription-activated-parses-correctly',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-fixture-sub',
          event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
          resource: FIXTURE_SUBSCRIPTION_ACTIVE,
        });

        assert.equal(result.category, 'subscription', 'Category should be subscription');
        assert.equal(result.resourceType, 'subscription', 'Resource type should be subscription');
        assert.equal(result.resourceId, 'I-MTPRX0B9LV4R', 'Resource ID from fixture');
        assert.equal(result.uid, 'test-user-789', 'UID from fixture custom_id');
        assert.equal(result.eventType, 'BILLING.SUBSCRIPTION.ACTIVATED', 'Event type should match');
      },
    },

    {
      name: 'fixture-order-approved-parses-correctly',
      async run({ assert }) {
        const result = parseWebhook({
          id: 'WH-fixture-order',
          event_type: 'CHECKOUT.ORDER.APPROVED',
          resource: FIXTURE_ORDER_APPROVED,
        });

        assert.equal(result.category, 'one-time', 'Category should be one-time');
        assert.equal(result.resourceType, 'order', 'Resource type should be order');
        assert.equal(result.resourceId, '5UX02069M9686893E', 'Resource ID from fixture');
        assert.equal(result.uid, 'test-user-123', 'UID from fixture purchase_units custom_id');
        assert.equal(result.eventType, 'CHECKOUT.ORDER.APPROVED', 'Event type should match');
      },
    },
  ],
};
