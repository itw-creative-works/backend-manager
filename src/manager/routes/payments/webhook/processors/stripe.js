/**
 * Stripe webhook processor
 * Extracts, validates, and categorizes webhook event data from Stripe
 *
 * Each event is mapped to a category (subscription or one-time) and includes
 * the resource type + ID needed to fetch the latest state from Stripe's API.
 */

// Events we process, mapped to their default category
// Some events (invoice.payment_failed, checkout.session.completed) require
// inspecting the payload to determine the actual category
const SUPPORTED_EVENTS = new Set([
  // Subscription lifecycle
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',

  // Payment failures (could be subscription or one-time)
  'invoice.payment_failed',

  // Checkout completion (could be subscription or one-time)
  'checkout.session.completed',

  // Refunds
  'charge.refunded',
]);

module.exports = {
  /**
   * Returns true if this event type should be saved and processed
   */
  isSupported(eventType) {
    return SUPPORTED_EVENTS.has(eventType);
  },

  /**
   * Parse a Stripe webhook request
   * Extracts event data and determines category, resource type, resource ID, and UID
   *
   * @param {object} req - The raw HTTP request
   * @returns {object} { eventId, eventType, category, resourceType, resourceId, raw, uid }
   *   - category: 'subscription' | 'one-time' | null (null = skip)
   *   - resourceType: 'subscription' | 'invoice' | 'session'
   *   - resourceId: ID to fetch from processor API
   */
  parseWebhook(req) {
    const event = req.body;

    // Validate event structure
    if (!event || !event.id || !event.type) {
      throw new Error('Invalid Stripe webhook payload');
    }

    const dataObject = event.data?.object || {};
    const eventType = event.type;

    // Resolve category, resource info, and UID based on event type
    let category = null;
    let resourceType = null;
    let resourceId = null;
    let uid = null;

    if (eventType.startsWith('customer.subscription.')) {
      // Subscription lifecycle events — always subscription category
      category = 'subscription';
      resourceType = 'subscription';
      resourceId = dataObject.id;
      uid = dataObject.metadata?.uid || null;

    } else if (eventType === 'invoice.payment_failed') {
      // Payment failure — inspect billing_reason to determine category
      const billingReason = dataObject.billing_reason || '';
      const subscriptionId = dataObject.parent?.subscription_details?.subscription
        || dataObject.subscription
        || null;

      if (billingReason.startsWith('subscription') && subscriptionId) {
        // Subscription-related invoice failure
        category = 'subscription';
        resourceType = 'subscription';
        resourceId = subscriptionId;
        uid = dataObject.parent?.subscription_details?.metadata?.uid
          || dataObject.subscription_details?.metadata?.uid
          || dataObject.metadata?.uid
          || null;
      } else {
        // One-time invoice failure
        category = 'one-time';
        resourceType = 'invoice';
        resourceId = dataObject.id;
        uid = dataObject.metadata?.uid || null;
      }

    } else if (eventType === 'checkout.session.completed') {
      const mode = dataObject.mode;

      if (mode === 'subscription') {
        // Subscription checkout — skip, subscription events handle this
        category = null;
      } else if (mode === 'payment') {
        // One-time payment checkout
        category = 'one-time';
        resourceType = 'session';
        resourceId = dataObject.id;
        uid = dataObject.metadata?.uid || null;
      }

    } else if (eventType === 'charge.refunded') {
      // Refund event — the charge object contains an invoice ID which links to a subscription
      const invoiceId = dataObject.invoice;
      const subscriptionId = dataObject.subscription
        || dataObject.metadata?.subscriptionId
        || null;

      if (subscriptionId) {
        // Subscription-related refund
        category = 'subscription';
        resourceType = 'subscription';
        resourceId = subscriptionId;
      } else if (invoiceId) {
        // Has invoice — likely subscription-related, will resolve via fetchResource
        category = 'subscription';
        resourceType = 'invoice';
        resourceId = invoiceId;
      } else {
        // One-time payment refund — skip for now (no subscription to update)
        category = null;
      }

      uid = dataObject.metadata?.uid || null;
    }

    return {
      eventId: event.id,
      eventType: eventType,
      category: category,
      resourceType: resourceType,
      resourceId: resourceId,
      raw: event,
      uid: uid,
    };
  },
};
