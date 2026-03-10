const fetch = require('wonderful-fetch');

/**
 * Payment analytics tracking
 * Fires server-side events independently to GA4, Meta Conversions API, and TikTok Events API
 *
 * Two independent concerns:
 *   1. Transition events (mutually exclusive, one per webhook):
 *      new-subscription (no trial) → purchase
 *      new-subscription (trial)    → start_trial
 *      payment-recovered           → purchase (recurring)
 *      purchase-completed          → purchase (one-time)
 *
 *   2. Payment events (fire whenever money changes hands, including renewals):
 *      subscription renewal        → purchase (recurring)
 */

/**
 * Track payment events across analytics platforms (non-blocking)
 * Fires GA4, Meta, and TikTok independently with per-platform payloads
 */
function trackPayment({ category, transitionName, eventType, unified, uid, processor, assistant }) {
  const Manager = assistant.Manager;
  const config = Manager.config;

  try {
    // Resolve what kind of payment event this is
    const resolved = resolvePaymentEvent(category, transitionName, eventType, unified);

    if (!resolved) {
      assistant.log(`trackPayment: skipped — no trackable event (category=${category}, transition=${transitionName || 'null'}, eventType=${eventType})`);
      return;
    }

    const currency = config.payment?.currency || 'USD';

    assistant.log(`trackPayment: reason=${resolved.reason}, value=${resolved.value}, currency=${currency}, product=${resolved.productId}, uid=${uid}, processor=${processor}`);

    // Fire each platform independently (non-blocking, errors isolated)
    fireGA4({ resolved, currency, uid, processor, assistant, Manager });
    fireMeta({ resolved, currency, uid, processor, assistant, config });
    fireTikTok({ resolved, currency, uid, processor, assistant, config });
  } catch (e) {
    assistant.error(`trackPayment failed: ${e.message}`, e);
  }
}

// ---------------------------------------------------------------------------
// Event resolution
// ---------------------------------------------------------------------------

/**
 * Determine what kind of payment event occurred and extract common fields
 * Returns null if nothing should be tracked
 */
function resolvePaymentEvent(category, transitionName, eventType, unified) {
  const productId = unified.product?.id;
  const productName = unified.product?.name;
  const frequency = unified.payment?.frequency || null;
  const isTrial = unified.trial?.claimed === true;
  const resourceId = unified.payment?.resourceId;
  const price = unified.payment?.price || 0;

  const base = { productId, productName, frequency, resourceId, isTrial };

  // --- Subscription transitions ---
  if (category === 'subscription') {
    if (transitionName === 'new-subscription' && isTrial) {
      return { ...base, reason: 'trial-started', value: 0, isRecurring: false };
    }

    if (transitionName === 'new-subscription') {
      return { ...base, reason: 'first-purchase', value: price, isRecurring: false };
    }

    if (transitionName === 'payment-recovered') {
      return { ...base, reason: 'payment-recovered', value: price, isRecurring: true };
    }

    // No transition but a payment event fired (renewal)
    if (!transitionName && isPaymentEvent(eventType) && price > 0) {
      return { ...base, reason: 'renewal', value: price, isRecurring: true };
    }

    return null;
  }

  // --- One-time transitions ---
  if (category === 'one-time') {
    if (transitionName === 'purchase-completed') {
      return { ...base, reason: 'one-time-purchase', value: price, isRecurring: false, productId: productId || 'unknown', productName: productName || 'Unknown' };
    }

    return null;
  }

  return null;
}

/**
 * Check if a webhook event type represents a payment being made
 */
function isPaymentEvent(eventType) {
  if (!eventType) {
    return false;
  }

  return [
    // PayPal
    'PAYMENT.SALE.COMPLETED',
    // Stripe
    'invoice.payment_succeeded',
    'invoice.paid',
  ].includes(eventType);
}

// ---------------------------------------------------------------------------
// GA4 — Measurement Protocol
// ---------------------------------------------------------------------------

/**
 * Fire GA4 event via Manager.Analytics (Measurement Protocol)
 * https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */
function fireGA4({ resolved, currency, uid, processor, assistant, Manager }) {
  try {
    // Map reason → GA4 event name
    const eventName = resolved.reason === 'trial-started' ? 'start_trial' : 'purchase';

    Manager.Analytics({ assistant, uuid: uid }).event(eventName, {
      transaction_id: resolved.resourceId,
      value: resolved.value,
      currency: currency,
      items: [{
        item_id: resolved.productId,
        item_name: resolved.productName,
        price: resolved.value,
        quantity: 1,
      }],
      payment_processor: processor,
      payment_frequency: resolved.frequency,
      is_trial: resolved.isTrial,
      is_recurring: resolved.isRecurring,
    });

    assistant.log(`trackPayment [GA4]: event=${eventName}, value=${resolved.value}, product=${resolved.productId}, uid=${uid}`);
  } catch (e) {
    assistant.error(`trackPayment [GA4] failed: ${e.message}`, e);
  }
}

// ---------------------------------------------------------------------------
// Meta — Conversions API
// ---------------------------------------------------------------------------

// Meta event name mapping
const META_EVENTS = {
  'trial-started': 'StartTrial',
  'first-purchase': 'Purchase',
  'payment-recovered': 'Subscribe',
  'renewal': 'Subscribe',
  'one-time-purchase': 'Purchase',
};

/**
 * Fire Meta Conversions API event
 * https://developers.facebook.com/docs/marketing-api/conversions-api
 */
function fireMeta({ resolved, currency, uid, processor, assistant, config }) {
  try {
    const pixelId = config.meta?.pixelId;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (!pixelId || !accessToken) {
      return;
    }

    const eventName = META_EVENTS[resolved.reason];

    if (!eventName) {
      return;
    }

    const payload = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        user_data: {
          external_id: uid,
        },
        custom_data: {
          value: resolved.value,
          currency: currency,
          content_ids: [resolved.productId],
          content_name: resolved.productName,
          content_type: 'product',
          payment_processor: processor,
          is_recurring: resolved.isRecurring,
        },
      }],
    };

    fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`, {
      method: 'post',
      response: 'json',
      body: payload,
      timeout: 30000,
      tries: 2,
    })
    .then(() => {
      assistant.log(`trackPayment [Meta]: event=${eventName}, value=${resolved.value}, product=${resolved.productId}, uid=${uid}`);
    })
    .catch((e) => {
      assistant.error(`trackPayment [Meta] failed: ${e.message}`, e);
    });
  } catch (e) {
    assistant.error(`trackPayment [Meta] failed: ${e.message}`, e);
  }
}

// ---------------------------------------------------------------------------
// TikTok — Events API
// ---------------------------------------------------------------------------

// TikTok event name mapping
const TIKTOK_EVENTS = {
  'trial-started': 'Subscribe',
  'first-purchase': 'CompletePayment',
  'payment-recovered': 'Subscribe',
  'renewal': 'Subscribe',
  'one-time-purchase': 'CompletePayment',
};

/**
 * Fire TikTok Events API event
 * https://business-api.tiktok.com/portal/docs?id=1771100865818625
 */
function fireTikTok({ resolved, currency, uid, processor, assistant, config }) {
  try {
    const pixelCode = config.tiktok?.pixelCode;
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN;

    if (!pixelCode || !accessToken) {
      return;
    }

    const eventName = TIKTOK_EVENTS[resolved.reason];

    if (!eventName) {
      return;
    }

    const payload = {
      pixel_code: pixelCode,
      event: eventName,
      event_id: `${uid}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      context: {
        user: {
          external_id: uid,
        },
      },
      properties: {
        value: resolved.value,
        currency: currency,
        content_id: resolved.productId,
        content_name: resolved.productName,
        content_type: 'product',
        description: `${resolved.reason} via ${processor}`,
      },
    };

    fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'post',
      response: 'json',
      headers: {
        'Access-Token': accessToken,
      },
      body: { data: [payload] },
      timeout: 30000,
      tries: 2,
    })
    .then(() => {
      assistant.log(`trackPayment [TikTok]: event=${eventName}, value=${resolved.value}, product=${resolved.productId}, uid=${uid}`);
    })
    .catch((e) => {
      assistant.error(`trackPayment [TikTok] failed: ${e.message}`, e);
    });
  } catch (e) {
    assistant.error(`trackPayment [TikTok] failed: ${e.message}`, e);
  }
}

module.exports = { trackPayment };
