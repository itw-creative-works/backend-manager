/**
 * Test: Chargebee toUnifiedOneTime()
 * Unit tests for the Chargebee library's invoice → unified one-time transformation
 */
const Chargebee = require('../../../../src/manager/libraries/payment/processors/chargebee.js');

const FIXTURE_INVOICE = require('../../../fixtures/chargebee/invoice-one-time.json');

const MOCK_CONFIG = {
  payment: {
    products: [
      { id: 'basic', name: 'Basic', type: 'subscription' },
      {
        id: 'credits-100', name: '100 Credits', type: 'one-time',
        prices: { once: 9.99 },
      },
    ],
  },
};

function toUnifiedOneTime(rawResource, options) {
  return Chargebee.toUnifiedOneTime(rawResource, { config: MOCK_CONFIG, ...options });
}

module.exports = {
  description: 'Chargebee toUnifiedOneTime() transformation',
  type: 'group',

  tests: [
    {
      name: 'status-paid-to-completed',
      async run({ assert }) {
        const result = toUnifiedOneTime({ status: 'paid' });
        assert.equal(result.status, 'completed', 'paid → completed');
      },
    },

    {
      name: 'status-not-paid-to-failed',
      async run({ assert }) {
        const result = toUnifiedOneTime({ status: 'not_paid' });
        assert.equal(result.status, 'failed', 'not_paid → failed');
      },
    },

    {
      name: 'status-payment-due-to-failed',
      async run({ assert }) {
        const result = toUnifiedOneTime({ status: 'payment_due' });
        assert.equal(result.status, 'failed', 'payment_due → failed');
      },
    },

    {
      name: 'status-unknown-passthrough',
      async run({ assert }) {
        const result = toUnifiedOneTime({ status: 'pending' });
        assert.equal(result.status, 'pending', 'Other statuses pass through');
      },
    },

    {
      name: 'processor-always-chargebee',
      async run({ assert }) {
        const result = toUnifiedOneTime({});
        assert.equal(result.payment.processor, 'chargebee', 'Processor should be chargebee');
      },
    },

    {
      name: 'resource-id-from-invoice-id',
      async run({ assert }) {
        const result = toUnifiedOneTime({ id: 'inv_123' });
        assert.equal(result.payment.resourceId, 'inv_123', 'resourceId from invoice id');
      },
    },

    {
      name: 'order-id-from-meta-data',
      async run({ assert }) {
        const result = toUnifiedOneTime({ meta_data: '{"orderId":"1234-5678-9012"}' });
        assert.equal(result.payment.orderId, '1234-5678-9012', 'orderId from meta_data');
      },
    },

    {
      name: 'order-id-from-cf-legacy',
      async run({ assert }) {
        const result = toUnifiedOneTime({ cf_clientorderid: 'legacy-order' });
        assert.equal(result.payment.orderId, 'legacy-order', 'orderId from cf_clientorderid');
      },
    },

    {
      name: 'product-resolves-from-meta-data',
      async run({ assert }) {
        const result = toUnifiedOneTime({
          meta_data: '{"productId":"credits-100"}',
          status: 'paid',
        });
        assert.equal(result.product.id, 'credits-100', 'Product resolved from meta_data');
        assert.equal(result.product.name, '100 Credits', 'Product name resolved');
      },
    },

    {
      name: 'product-unknown-when-no-meta-data',
      async run({ assert }) {
        const result = toUnifiedOneTime({});
        assert.equal(result.product.id, 'unknown', 'No productId → unknown');
      },
    },

    {
      name: 'event-metadata-passed-through',
      async run({ assert }) {
        const result = toUnifiedOneTime({}, { eventName: 'invoice_generated', eventId: 'ev_inv' });
        assert.equal(result.payment.updatedBy.event.name, 'invoice_generated', 'Event name');
        assert.equal(result.payment.updatedBy.event.id, 'ev_inv', 'Event ID');
      },
    },

    {
      name: 'fixture-invoice-one-time',
      async run({ assert }) {
        const result = toUnifiedOneTime(FIXTURE_INVOICE);
        assert.equal(result.status, 'completed', 'Fixture paid → completed');
        assert.equal(result.payment.processor, 'chargebee', 'Processor is chargebee');
        assert.equal(result.payment.resourceId, FIXTURE_INVOICE.id, 'Resource ID matches fixture');
        assert.equal(result.payment.orderId, '6789-0123-4567', 'Order ID from meta_data');
        assert.equal(result.product.id, 'credits-100', 'Product from meta_data productId');
      },
    },

    {
      name: 'unified-shape-complete',
      async run({ assert }) {
        const result = toUnifiedOneTime(FIXTURE_INVOICE);
        assert.ok(result.product, 'Should have product');
        assert.ok(result.status, 'Should have status');
        assert.ok(result.payment, 'Should have payment');
        assert.ok(result.payment.updatedBy, 'Should have updatedBy');
        assert.ok(result.payment.updatedBy.date, 'Should have updatedBy.date');
      },
    },
  ],
};
