/**
 * Payment analytics tracking
 * Fires server-side events for GA4, Meta Conversions API, and TikTok Events API
 *
 * Maps transitions to standard platform events:
 *   new-subscription (no trial) → purchase / Purchase / CompletePayment
 *   new-subscription (trial)    → start_trial / StartTrial / Subscribe
 *   payment-recovered           → purchase / Subscribe / Subscribe (recurring)
 *   purchase-completed          → purchase / Purchase / CompletePayment
 */

/**
 * Track payment events across analytics platforms (non-blocking)
 *
 * @param {object} options
 * @param {string} options.category - 'subscription' or 'one-time'
 * @param {string} options.transitionName - Detected transition (e.g., 'new-subscription', 'purchase-completed')
 * @param {object} options.unified - Unified subscription or one-time object
 * @param {string} options.uid - User ID
 * @param {string} options.processor - Payment processor (e.g., 'stripe', 'paypal')
 * @param {object} options.assistant - Assistant instance (Manager derived via assistant.Manager)
 */
function trackPayment({ category, transitionName, unified, uid, processor, assistant }) {
  const Manager = assistant.Manager;

  try {
    // Resolve the analytics event to fire based on transition
    const event = resolvePaymentEvent(category, transitionName, unified, Manager.config);

    if (!event) {
      return;
    }

    assistant.log(`trackPayment: event=${event.ga4}, value=${event.value}, currency=${event.currency}, product=${event.productId}, uid=${uid}`);

    // GA4 via Measurement Protocol
    Manager.Analytics({ assistant, uuid: uid }).event(event.ga4, {
      transaction_id: event.transactionId,
      value: event.value,
      currency: event.currency,
      items: [{
        item_id: event.productId,
        item_name: event.productName,
        price: event.value,
        quantity: 1,
      }],
      payment_processor: processor,
      payment_frequency: event.frequency,
      is_trial: event.isTrial,
      is_recurring: event.isRecurring,
    });

    // TODO: Meta Conversions API
    // Event name: event.meta (e.g., 'Purchase', 'StartTrial', 'Subscribe')
    // https://developers.facebook.com/docs/marketing-api/conversions-api

    // TODO: TikTok Events API
    // Event name: event.tiktok (e.g., 'CompletePayment', 'Subscribe')
    // https://business-api.tiktok.com/portal/docs?id=1771100865818625
  } catch (e) {
    assistant.error(`trackPayment failed: ${e.message}`, e);
  }
}

/**
 * Resolve which analytics event to fire based on transition + unified data
 * Returns null if the transition doesn't warrant an analytics event
 */
function resolvePaymentEvent(category, transitionName, unified, config) {
  if (category === 'subscription') {
    return resolveSubscriptionEvent(transitionName, unified, config);
  }

  if (category === 'one-time') {
    return resolveOneTimeEvent(transitionName, unified, config);
  }

  return null;
}

/**
 * Map subscription transitions to analytics events
 */
function resolveSubscriptionEvent(transitionName, unified, config) {
  const productId = unified.product?.id;
  const productName = unified.product?.name;
  const frequency = unified.payment?.frequency;
  const isTrial = unified.trial?.claimed === true;
  const resourceId = unified.payment?.resourceId;
  const price = unified.payment?.price || 0;

  if (transitionName === 'new-subscription' && isTrial) {
    return {
      ga4: 'start_trial',
      meta: 'StartTrial',
      tiktok: 'Subscribe',
      value: 0,
      currency: config.payment?.currency || 'USD',
      productId,
      productName,
      frequency,
      isTrial: true,
      isRecurring: false,
      transactionId: resourceId,
    };
  }

  if (transitionName === 'new-subscription') {
    return {
      ga4: 'purchase',
      meta: 'Purchase',
      tiktok: 'CompletePayment',
      value: price,
      currency: config.payment?.currency || 'USD',
      productId,
      productName,
      frequency,
      isTrial: false,
      isRecurring: false,
      transactionId: resourceId,
    };
  }

  if (transitionName === 'payment-recovered') {
    return {
      ga4: 'purchase',
      meta: 'Subscribe',
      tiktok: 'Subscribe',
      value: price,
      currency: config.payment?.currency || 'USD',
      productId,
      productName,
      frequency,
      isTrial: false,
      isRecurring: true,
      transactionId: resourceId,
    };
  }

  return null;
}

/**
 * Map one-time transitions to analytics events
 */
function resolveOneTimeEvent(transitionName, unified, config) {
  if (transitionName !== 'purchase-completed') {
    return null;
  }

  const productId = unified.product?.id;
  const productName = unified.product?.name;
  const price = unified.payment?.price || 0;
  const resourceId = unified.payment?.resourceId;

  return {
    ga4: 'purchase',
    meta: 'Purchase',
    tiktok: 'CompletePayment',
    value: price,
    currency: config.payment?.currency || 'USD',
    productId: productId || 'unknown',
    productName: productName || 'Unknown',
    frequency: null,
    isTrial: false,
    isRecurring: false,
    transactionId: resourceId,
  };
}

module.exports = { trackPayment };
