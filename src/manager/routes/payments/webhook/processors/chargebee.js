/**
 * Chargebee webhook processor
 * Extracts, validates, and categorizes webhook event data from Chargebee
 *
 * Chargebee webhook payload structure:
 * {
 *   id: "ev_xxx",
 *   occurred_at: 1234567890,
 *   event_type: "subscription_created",
 *   content: { subscription: {...}, customer: {...}, invoice: {...} }
 * }
 */

const ChargebeeLib = require('../../../../libraries/payment/processors/chargebee.js');

// Events we process — mapped to their category
const SUPPORTED_EVENTS = new Set([
  // Subscription lifecycle
  'subscription_created',
  'subscription_activated',
  'subscription_changed',
  'subscription_cancelled',
  'subscription_reactivated',
  'subscription_renewed',
  'subscription_cancellation_scheduled',
  'subscription_scheduled_cancellation_removed',
  'subscription_paused',
  'subscription_resumed',

  // Payment events
  'payment_failed',
  'payment_refunded',

  // One-time (non-recurring invoice)
  'invoice_generated',
]);

// Events that are always subscription-related
const SUBSCRIPTION_EVENTS = new Set([
  'subscription_created',
  'subscription_activated',
  'subscription_changed',
  'subscription_cancelled',
  'subscription_reactivated',
  'subscription_renewed',
  'subscription_cancellation_scheduled',
  'subscription_scheduled_cancellation_removed',
  'subscription_paused',
  'subscription_resumed',
]);

module.exports = {
  /**
   * Returns true if this event type should be saved and processed
   */
  isSupported(eventType) {
    return SUPPORTED_EVENTS.has(eventType);
  },

  /**
   * Parse a Chargebee webhook request
   *
   * @param {object} req - The raw HTTP request
   * @returns {object} { eventId, eventType, category, resourceType, resourceId, raw, uid }
   */
  parseWebhook(req) {
    const event = req.body;

    // Validate event structure
    if (!event || !event.id || !event.event_type) {
      throw new Error('Invalid Chargebee webhook payload');
    }

    const eventType = event.event_type;
    const content = event.content || {};
    const subscription = content.subscription;
    const invoice = content.invoice;
    const customer = content.customer;

    let category = null;
    let resourceType = null;
    let resourceId = null;
    let uid = null;

    if (SUBSCRIPTION_EVENTS.has(eventType)) {
      // Subscription lifecycle events
      category = 'subscription';
      resourceType = 'subscription';
      resourceId = subscription?.id || null;
      uid = extractUid(subscription, customer);

    } else if (eventType === 'payment_failed') {
      // Payment failure — subscription-related if subscription is present
      if (subscription) {
        category = 'subscription';
        resourceType = 'subscription';
        resourceId = subscription.id;
        uid = extractUid(subscription, customer);
      } else {
        // One-time payment failure
        category = 'one-time';
        resourceType = 'invoice';
        resourceId = invoice?.id || null;
        uid = extractUid(null, customer);
      }

    } else if (eventType === 'payment_refunded') {
      // Refund — subscription-related if subscription is present
      if (subscription) {
        category = 'subscription';
        resourceType = 'subscription';
        resourceId = subscription.id;
        uid = extractUid(subscription, customer);
      } else {
        // Non-subscription refund — skip
        category = null;
      }

    } else if (eventType === 'invoice_generated') {
      // Check if it's a non-recurring invoice (one-time purchase)
      if (invoice && !invoice.subscription_id) {
        category = 'one-time';
        resourceType = 'invoice';
        resourceId = invoice.id;
        uid = extractUid(null, customer);
      } else {
        // Recurring invoice — skip (subscription events handle this)
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
 * Extract UID from Chargebee subscription meta_data or customer
 * Tries subscription meta_data first, then customer meta_data, then cf_ fields
 *
 * @param {object|null} subscription - Chargebee subscription object
 * @param {object|null} customer - Chargebee customer object
 * @returns {string|null}
 */
function extractUid(subscription, customer) {
  // Try subscription meta_data
  if (subscription) {
    const uid = ChargebeeLib.getUid(subscription);
    if (uid) {
      return uid;
    }
  }

  // Try customer meta_data
  if (customer) {
    const uid = ChargebeeLib.getUid(customer);
    if (uid) {
      return uid;
    }
  }

  return null;
}
