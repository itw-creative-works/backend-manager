/**
 * Chargebee portal processor
 * Creates a Chargebee Self-Serve Portal session for the customer.
 *
 * The portal session provides an access_url that expires after 1 hour.
 * Once accessed, the session remains valid until the user logs out.
 */
module.exports = {
  /**
   * Create a Chargebee Portal session
   *
   * @param {object} options
   * @param {string} options.uid - User's UID
   * @param {string} options.email - User's email
   * @param {string|null} options.returnUrl - URL to redirect after logout
   * @param {object} options.assistant - Assistant instance for logging
   * @returns {object} { url }
   */
  async createPortalSession({ uid, email, returnUrl, assistant }) {
    const ChargebeeLib = require('../../../../libraries/payment/processors/chargebee.js');
    ChargebeeLib.init();

    // Chargebee portal sessions require a customer ID.
    // The customer_id in Chargebee is set during subscription checkout.
    // We look up the subscription to find the Chargebee customer_id.
    const admin = assistant.Manager.libraries.admin;
    const userDoc = await admin.firestore().doc(`users/${uid}`).get();
    const subscription = userDoc.data()?.subscription;

    if (!subscription?.payment?.resourceId) {
      throw new Error('No active subscription found for portal access');
    }

    // Fetch the subscription to get the customer_id
    const subResult = await ChargebeeLib.request(`/subscriptions/${subscription.payment.resourceId}`);
    const customerId = subResult.subscription?.customer_id;

    if (!customerId) {
      throw new Error('Could not resolve Chargebee customer ID');
    }

    // Create portal session
    const params = {
      customer: { id: customerId },
    };

    if (returnUrl) {
      params.redirect_url = returnUrl;
    }

    const result = await ChargebeeLib.request('/portal_sessions', {
      method: 'POST',
      body: params,
    });

    const portalSession = result.portal_session;

    assistant.log(`Chargebee portal session created: uid=${uid}, customerId=${customerId}, url=${portalSession.access_url}`);

    return { url: portalSession.access_url };
  },
};
