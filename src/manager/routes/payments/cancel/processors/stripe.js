/**
 * Stripe cancel processor
 * Sets a subscription to cancel at the end of the current billing period
 */
module.exports = {
  /**
   * Cancel a Stripe subscription at period end
   *
   * @param {object} options
   * @param {string} options.resourceId - Stripe subscription ID (e.g., 'sub_xxx')
   * @param {string} options.uid - User's UID (for logging)
   * @param {object} options.assistant - Assistant instance for logging
   */
  async cancelAtPeriodEnd({ resourceId, uid, assistant }) {
    const StripeLib = require('../../../../libraries/payment/processors/stripe.js');
    const stripe = StripeLib.init();

    await stripe.subscriptions.update(resourceId, { cancel_at_period_end: true });

    assistant.log(`Stripe cancel at period end: sub=${resourceId}, uid=${uid}`);
  },
};
