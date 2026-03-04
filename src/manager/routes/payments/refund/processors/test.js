const powertools = require('node-powertools');

/**
 * Test refund processor
 * Simulates a Stripe refund + immediate cancellation by writing directly to
 * payments-webhooks/{eventId} with status=pending.
 * The on-write trigger picks it up and runs the full pipeline,
 * resulting in a subscription-cancelled transition.
 * Only available in non-production environments.
 */
module.exports = {
  async processRefund({ resourceId, uid, subscription, assistant }) {
    if (assistant.isProduction()) {
      throw new Error('Test processor is not available in production');
    }

    const admin = assistant.Manager.libraries.admin;

    const timestamp = Date.now();
    const eventId = `_test-evt-refund-${timestamp}`;
    const now = Math.floor(timestamp / 1000);

    // Look up the Stripe product ID from the existing order so resolveProduct() can match
    const orderId = subscription?.payment?.orderId;
    let stripeProductId = null;

    if (orderId) {
      const orderDoc = await admin.firestore().doc(`payments-orders/${orderId}`).get();
      if (orderDoc.exists) {
        const orderData = orderDoc.data();
        const productId = orderData.unified?.product?.id;
        const products = assistant.Manager.config.payment?.products || [];
        const product = products.find(p => p.id === productId);
        stripeProductId = product?.stripe?.productId || null;
      }
    }

    // Build a Stripe-shaped customer.subscription.deleted payload
    // Mirrors what Stripe sends after an immediate cancellation (refund + cancel)
    const subscriptionObj = {
      id: resourceId,
      object: 'subscription',
      status: 'canceled',
      metadata: { uid, orderId },
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: now,
      current_period_end: now,
      current_period_start: now - (30 * 86400),
      start_date: now - (30 * 86400),
      trial_start: null,
      trial_end: null,
      plan: { product: stripeProductId, interval: 'month' },
    };

    const nowTs = powertools.timestamp(new Date(), { output: 'string' });
    const nowUNIX = powertools.timestamp(nowTs, { output: 'unix' });

    // Write directly to payments-webhooks — on-write trigger handles the rest
    await admin.firestore().doc(`payments-webhooks/${eventId}`).set({
      id: eventId,
      processor: 'test',
      status: 'pending',
      owner: uid,
      raw: {
        id: eventId,
        type: 'customer.subscription.deleted',
        data: { object: subscriptionObj },
      },
      event: {
        type: 'customer.subscription.deleted',
        category: 'subscription',
        resourceType: 'subscription',
        resourceId: resourceId,
      },
      error: null,
      metadata: {
        received: {
          timestamp: nowTs,
          timestampUNIX: nowUNIX,
        },
        processed: {
          timestamp: null,
          timestampUNIX: null,
        },
      },
    });

    assistant.log(`Test refund processor: wrote payments-webhooks/${eventId} for sub=${resourceId}, uid=${uid}`);

    // Return mock refund result
    return {
      amount: subscription?.payment?.price || 0,
      currency: 'usd',
      full: true,
    };
  },
};
