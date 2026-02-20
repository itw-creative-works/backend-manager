/**
 * Test webhook processor
 * Delegates to Stripe's parser since test processor generates Stripe-shaped event payloads
 */
const stripeProcessor = require('./stripe.js');

module.exports = {
  isSupported(eventType) {
    return stripeProcessor.isSupported(eventType);
  },

  parseWebhook(req) {
    return stripeProcessor.parseWebhook(req);
  },
};
