/**
 * Stripe webhook processor
 * Extracts and validates webhook event data from Stripe
 */

// Stripe event types we process — add new ones here as needed
const SUPPORTED_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
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
   * Extracts the event data, event type, and resolves the UID from metadata
   *
   * @param {object} req - The raw HTTP request
   * @returns {object} { eventId, eventType, raw, uid }
   */
  parseWebhook(req) {
    const event = req.body;

    // Validate event structure
    if (!event || !event.id || !event.type) {
      throw new Error('Invalid Stripe webhook payload');
    }

    // The subscription object is typically in event.data.object
    const dataObject = event.data?.object || {};

    // Resolve UID from subscription metadata
    // When creating checkout sessions, we set metadata.uid on the subscription
    const uid = dataObject.metadata?.uid || null;

    return {
      eventId: event.id,
      eventType: event.type,
      raw: event,
      uid: uid,
    };
  },
};
