const powertools = require('node-powertools');

/**
 * Test cancel processor
 * Simulates the Stripe webhook that results from cancellation
 * by writing directly to payments-webhooks/{eventId} with status=pending.
 * The on-write trigger picks it up and runs the full pipeline.
 *
 * If the user is trialing, simulates immediate cancellation (customer.subscription.deleted).
 * Otherwise, simulates cancel at period end (customer.subscription.updated with cancel_at_period_end=true).
 *
 * Only available in non-production environments.
 */
module.exports = {
  async cancelAtPeriodEnd({ resourceId, uid, subscription, assistant }) {
    if (assistant.isProduction()) {
      throw new Error('Test processor is not available in production');
    }

    const admin = assistant.Manager.libraries.admin;

    const timestamp = Date.now();
    const now = Math.floor(timestamp / 1000);
    const periodEnd = now + (30 * 86400);

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

    // Detect if user is on a trial
    const isTrialing = subscription?.trial?.claimed
      && subscription?.status === 'active'
      && subscription?.trial?.expires?.timestampUNIX === subscription?.expires?.timestampUNIX;

    // Trialing: immediate cancel (customer.subscription.deleted)
    // Non-trialing: cancel at period end (customer.subscription.updated)
    const eventType = isTrialing
      ? 'customer.subscription.deleted'
      : 'customer.subscription.updated';
    const eventId = `_test-evt-cancel-${timestamp}`;

    const subscriptionObj = {
      id: resourceId,
      object: 'subscription',
      status: isTrialing ? 'canceled' : 'active',
      metadata: { uid, orderId },
      cancel_at_period_end: !isTrialing,
      cancel_at: isTrialing ? now : periodEnd,
      canceled_at: isTrialing ? now : null,
      current_period_end: isTrialing ? now : periodEnd,
      current_period_start: now - (30 * 86400),
      start_date: now - (30 * 86400),
      trial_start: isTrialing ? (now - 86400) : null,
      trial_end: isTrialing ? now : null,
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
        type: eventType,
        data: { object: subscriptionObj },
      },
      event: {
        type: eventType,
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

    assistant.log(`Test cancel processor: wrote payments-webhooks/${eventId} (${eventType}) for sub=${resourceId}, uid=${uid}, trialing=${isTrialing}`);
  },
};
