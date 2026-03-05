const Stripe = require('./stripe.js');

/**
 * Test processor library
 * Delegates to Stripe's transformers since test processor generates Stripe-shaped data
 * Stamps processor as 'test' to distinguish from real Stripe data
 */
const Test = {
  /**
   * No-op init — test processor doesn't need an external SDK
   */
  init() {
    return null;
  },

  /**
   * Fetch resource — test processor has no real API
   *
   * When the requested resourceType doesn't match the fallback (e.g., requesting a subscription
   * but the fallback is an invoice from invoice.payment_failed), look up the existing resource
   * from Firestore instead of returning mismatched data.
   */
  async fetchResource(resourceType, resourceId, rawFallback, context) {
    // If the fallback matches the requested type AND has a UID, return it directly
    // When UID is missing (e.g., PAYMENT.SALE events), fall through to Firestore lookup
    // so we can reconstruct a resource with the UID from the order's owner field
    const fallbackHasUid = rawFallback?.metadata?.uid;
    if (rawFallback?.object === resourceType && fallbackHasUid) {
      return rawFallback;
    }

    // Look up the existing resource from payments-orders in Firestore
    // This simulates what a real API call (Stripe/PayPal) would return — a resource
    // with the full metadata including UID
    const admin = context?.admin;
    if (admin && resourceId) {
      const snapshot = await admin.firestore()
        .collection('payments-orders')
        .where('resourceId', '==', resourceId)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        // payments-orders stores the unified subscription inside .unified
        // Reconstruct a Stripe-shaped object from the unified data for toUnifiedSubscription()
        if (resourceType === 'subscription' && data.unified) {
          const reconstructed = buildStripeSubscriptionFromUnified(data.unified, resourceId, context?.eventType, context?.config, data.owner);

          // If the fallback matched the type but lacked UID, overlay the webhook's new state
          // onto the reconstructed resource, but keep the reconstructed metadata (has uid)
          if (rawFallback?.object === resourceType) {
            return { ...rawFallback, metadata: { ...rawFallback.metadata, ...reconstructed.metadata } };
          }

          return reconstructed;
        }
      }
    }

    // Last resort: return the raw fallback
    return rawFallback;
  },

  /**
   * Extract orderId — delegates to Stripe (test processor uses Stripe-shaped data)
   */
  getOrderId(resource) {
    return Stripe.getOrderId(resource);
  },

  /**
   * Extract UID — delegates to Stripe (test processor uses Stripe-shaped data)
   */
  getUid(resource) {
    return Stripe.getUid(resource);
  },

  /**
   * Extract refund details — delegates to Stripe (test processor uses Stripe-shaped data)
   */
  getRefundDetails(raw) {
    return Stripe.getRefundDetails(raw);
  },

  /**
   * Transform raw subscription into unified shape
   * Delegates to Stripe's toUnifiedSubscription (same data shape), stamps processor as 'test'
   */
  toUnifiedSubscription(rawSubscription, options) {
    const unified = Stripe.toUnifiedSubscription(rawSubscription, options);
    unified.payment.processor = 'test';
    return unified;
  },

  /**
   * Transform raw one-time payment into unified shape
   * Delegates to Stripe's toUnifiedOneTime, stamps processor as 'test'
   */
  toUnifiedOneTime(rawResource, options) {
    const unified = Stripe.toUnifiedOneTime(rawResource, options);
    unified.payment.processor = 'test';
    return unified;
  },
};

module.exports = Test;

/**
 * Reconstruct a Stripe-shaped subscription from the unified subscription stored in Firestore
 * This is only needed for the test processor when the webhook fallback doesn't match the resource type
 * (e.g., invoice.payment_failed sends invoice data but we need the subscription)
 *
 * The unified → Stripe mapping must produce data that toUnifiedSubscription() can process correctly.
 * For payment failure events, we override the status to past_due so it maps to 'suspended'.
 */
function buildStripeSubscriptionFromUnified(unified, resourceId, eventType, config, ownerUid) {
  // Map unified status back to a Stripe status
  const STATUS_MAP = {
    active: 'active',
    suspended: 'past_due',
    cancelled: 'canceled',
  };

  // Map unified frequency back to Stripe interval
  const INTERVAL_MAP = {
    monthly: 'month',
    annually: 'year',
    weekly: 'week',
    daily: 'day',
  };

  // Determine status: for payment failure events, force past_due regardless of current state
  // In production, Stripe would have already updated the subscription status
  let status = STATUS_MAP[unified.status] || 'active';
  if (eventType === 'invoice.payment_failed') {
    status = 'past_due';
  }

  // Resolve the Stripe product ID from config
  // This is needed for resolveProduct() in toUnifiedSubscription() to match the correct product
  const frequency = unified.payment?.frequency;
  const productId = unified.product?.id;
  const stripeProductId = resolveStripeProductId(productId, config);

  return {
    id: resourceId,
    object: 'subscription',
    status: status,
    metadata: { orderId: unified.payment?.orderId || null, uid: ownerUid || null },
    plan: {
      product: stripeProductId,
      interval: INTERVAL_MAP[frequency] || 'month',
    },
    current_period_end: unified.expires?.timestampUNIX || 0,
    current_period_start: unified.payment?.startDate?.timestampUNIX || 0,
    start_date: unified.payment?.startDate?.timestampUNIX || 0,
    cancel_at_period_end: unified.cancellation?.pending || false,
    cancel_at: unified.cancellation?.pending ? unified.cancellation?.date?.timestampUNIX : null,
    canceled_at: null,
    trial_start: unified.trial?.claimed ? (unified.payment?.startDate?.timestampUNIX || 0) : null,
    trial_end: unified.trial?.claimed ? (unified.trial?.expires?.timestampUNIX || 0) : null,
  };
}

/**
 * Look up the Stripe product ID from config given a product ID
 * e.g., ('plus') → 'prod_plus'
 */
function resolveStripeProductId(productId, config) {
  if (!productId || !config?.payment?.products) {
    return null;
  }

  const product = config.payment.products.find(p => p.id === productId);

  return product?.stripe?.productId || null;
}
