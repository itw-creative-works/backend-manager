const Stripe = require('./stripe.js');

/**
 * Test processor library
 * Delegates to Stripe's toUnified() since test processor generates Stripe-shaped data
 * Stamps processor as 'test' to distinguish from real Stripe subscriptions
 */
const Test = {
  /**
   * No-op init — test processor doesn't need an external SDK
   */
  init() {
    return null;
  },

  /**
   * Transform raw subscription into unified shape
   * Delegates to Stripe's toUnified (same data shape), stamps processor as 'test'
   */
  toUnified(rawSubscription, options) {
    const unified = Stripe.toUnified(rawSubscription, options);
    unified.payment.processor = 'test';
    return unified;
  },
};

module.exports = Test;
