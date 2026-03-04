/**
 * PayPal webhook processor
 * Extracts, validates, and categorizes webhook event data from PayPal
 *
 * PayPal webhook events: https://developer.paypal.com/api/rest/webhooks/event-names/
 */

// Events we process, mapped to their category
const SUPPORTED_EVENTS = new Set([
  // Subscription lifecycle
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.RE-ACTIVATED',

  // Payment events (subscription billing)
  'PAYMENT.SALE.COMPLETED',
  'PAYMENT.SALE.DENIED',
  'PAYMENT.SALE.REFUNDED',

  // One-time order events
  'CHECKOUT.ORDER.APPROVED',
]);

module.exports = {
  /**
   * Returns true if this event type should be saved and processed
   */
  isSupported(eventType) {
    return SUPPORTED_EVENTS.has(eventType);
  },

  /**
   * Parse a PayPal webhook request
   * Extracts event data and determines category, resource type, resource ID, and UID
   *
   * @param {object} req - The raw HTTP request
   * @returns {object} { eventId, eventType, category, resourceType, resourceId, raw, uid }
   */
  parseWebhook(req) {
    const event = req.body;

    // Validate event structure
    if (!event || !event.id || !event.event_type) {
      throw new Error('Invalid PayPal webhook payload');
    }

    const resource = event.resource || {};
    const eventType = event.event_type;

    let category = null;
    let resourceType = null;
    let resourceId = null;
    let uid = null;

    if (eventType.startsWith('BILLING.SUBSCRIPTION.')) {
      // Subscription lifecycle events
      category = 'subscription';
      resourceType = 'subscription';
      resourceId = resource.id; // PayPal subscription ID (I-xxx)

      // Parse uid from custom_id
      uid = parseUidFromCustomId(resource.custom_id);

    } else if (eventType === 'PAYMENT.SALE.COMPLETED' || eventType === 'PAYMENT.SALE.DENIED') {
      // Payment sale — determine if it's for a subscription
      const billingAgreementId = resource.billing_agreement_id;

      if (billingAgreementId) {
        // Subscription payment
        category = 'subscription';
        resourceType = 'subscription';
        resourceId = billingAgreementId; // This is the subscription ID

        uid = parseUidFromCustomId(resource.custom_id);
      } else {
        // One-time payment — skip for now (not yet supported)
        category = null;
      }

    } else if (eventType === 'CHECKOUT.ORDER.APPROVED') {
      // One-time order approved by buyer — will be captured in fetchResource
      category = 'one-time';
      resourceType = 'order';
      resourceId = resource.id; // PayPal order ID

      // Parse uid from purchase_units custom_id
      uid = parseUidFromCustomId(resource.purchase_units?.[0]?.custom_id);

    } else if (eventType === 'PAYMENT.SALE.REFUNDED') {
      // Refund — linked to a subscription via billing_agreement_id
      const billingAgreementId = resource.billing_agreement_id;

      if (billingAgreementId) {
        category = 'subscription';
        resourceType = 'subscription';
        resourceId = billingAgreementId;
        uid = parseUidFromCustomId(resource.custom_id);
      } else {
        category = null;
      }
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

/**
 * Parse uid from PayPal custom_id format: uid:{uid},orderId:{orderId}
 * @param {string} customId
 * @returns {string|null}
 */
function parseUidFromCustomId(customId) {
  if (!customId) {
    return null;
  }

  for (const part of customId.split(',')) {
    const [key, ...valueParts] = part.split(':');

    if (key === 'uid') {
      return valueParts.join(':') || null;
    }
  }

  return null;
}
