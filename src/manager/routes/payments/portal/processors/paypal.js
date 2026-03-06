/**
 * PayPal portal processor
 * PayPal does not have a hosted billing portal like Stripe.
 * Returns a link to PayPal's subscription management page.
 */
module.exports = {
  /**
   * Get the PayPal subscription management URL
   *
   * @param {object} options
   * @param {string} options.uid - User's UID
   * @param {string} options.email - User's email (not used for PayPal)
   * @param {string|null} options.returnUrl - Not used for PayPal
   * @param {object} options.assistant - Assistant instance for logging
   * @returns {object} { url }
   */
  async createPortalSession({ uid, email, returnUrl, assistant }) {
    // PayPal subscribers manage their subscription directly at PayPal
    const url = 'https://www.paypal.com/myaccount/autopay/';

    assistant.log(`PayPal portal redirect: uid=${uid}, url=${url}`);

    return { url };
  },
};
