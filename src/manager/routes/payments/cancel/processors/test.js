const powertools = require('node-powertools');

/**
 * Test cancel processor
 * Simulates the Stripe webhook that results from cancel_at_period_end=true
 * by writing directly to payments-webhooks/{eventId} with status=pending.
 * The on-write trigger picks it up and runs the full pipeline.
 * Only available in non-production environments.
 */
module.exports = {
  async cancelAtPeriodEnd({ resourceId, uid, subscription, assistant }) {
    if (assistant.isProduction()) {
      throw new Error('Test processor is not available in production');
    }

    const admin = assistant.Manager.libraries.admin;

    const timestamp = Date.now();
    const eventId = `_test-evt-cancel-${timestamp}`;
    const now = Math.floor(timestamp / 1000);
    const periodEnd = now + (30 * 86400);

    // Look up the price ID from the existing order so toUnifiedSubscription can resolve the product
    const orderId = subscription?.payment?.orderId;
    let priceId = null;

    if (orderId) {
      const orderDoc = await admin.firestore().doc(`payments-orders/${orderId}`).get();
      if (orderDoc.exists) {
        const orderData = orderDoc.data();
        // Find the matching price from config using frequency
        const frequency = orderData.unified?.payment?.frequency;
        const productId = orderData.unified?.product?.id;
        const products = assistant.Manager.config.payment?.products || [];
        const product = products.find(p => p.id === productId);
        priceId = product?.prices?.[frequency]?.stripe || null;
      }
    }

    // Build a Stripe-shaped customer.subscription.updated payload
    // with cancel_at_period_end=true — mirrors what Stripe sends after cancellation
    const subscriptionObj = {
      id: resourceId,
      object: 'subscription',
      status: 'active',
      metadata: { uid, orderId },
      cancel_at_period_end: true,
      cancel_at: periodEnd,
      canceled_at: null,
      current_period_end: periodEnd,
      current_period_start: now - (30 * 86400),
      start_date: now - (30 * 86400),
      trial_start: null,
      trial_end: null,
      plan: { id: priceId, interval: 'month' },
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
        type: 'customer.subscription.updated',
        data: { object: subscriptionObj },
      },
      event: {
        type: 'customer.subscription.updated',
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

    assistant.log(`Test cancel processor: wrote payments-webhooks/${eventId} for sub=${resourceId}, uid=${uid}`);
  },
};
