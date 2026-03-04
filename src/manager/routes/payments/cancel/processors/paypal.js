/**
 * PayPal cancel processor
 * Cancels a PayPal subscription
 *
 * Note: PayPal does not have "cancel at period end" like Stripe.
 * Cancellation takes effect immediately, but the subscriber retains access
 * until the end of the current billing period (PayPal's default behavior).
 */
module.exports = {
  /**
   * Cancel a PayPal subscription
   *
   * @param {object} options
   * @param {string} options.resourceId - PayPal subscription ID (e.g., 'I-xxx')
   * @param {string} options.uid - User's UID (for logging)
   * @param {object} options.assistant - Assistant instance for logging
   */
  async cancelAtPeriodEnd({ resourceId, uid, assistant }) {
    const PayPalLib = require('../../../../libraries/payment/processors/paypal.js');

    await PayPalLib.request(`/v1/billing/subscriptions/${resourceId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        reason: 'Customer requested cancellation',
      }),
    });

    assistant.log(`PayPal subscription cancelled: sub=${resourceId}, uid=${uid}`);
  },
};
