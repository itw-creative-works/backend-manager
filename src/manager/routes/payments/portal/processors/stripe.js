/**
 * Stripe portal processor
 * Creates a Stripe Billing Portal session with cancellation disabled.
 * The portal config is lazily created and cached per cold start.
 */

// Cached portal configuration ID (no cancellation allowed)
let portalConfigId = null;

module.exports = {
  /**
   * Create a Stripe Billing Portal session
   *
   * @param {object} options
   * @param {string} options.uid - User's UID
   * @param {string} options.email - User's email (for customer resolution)
   * @param {string|null} options.returnUrl - URL to return to after portal session
   * @param {object} options.assistant - Assistant instance for logging
   * @returns {object} { url }
   */
  async createPortalSession({ uid, email, returnUrl, assistant }) {
    const StripeLib = require('../../../../libraries/payment-processors/stripe.js');
    const stripe = StripeLib.init();

    // Resolve the Stripe customer for this user
    const customer = await StripeLib.resolveCustomer(uid, email, assistant);

    // Lazily create and cache a portal configuration with cancellation disabled
    if (!portalConfigId) {
      const config = await stripe.billingPortal.configurations.create({
        business_profile: {
          headline: 'Manage your subscription',
        },
        features: {
          subscription_cancel: { enabled: false },
          subscription_update: { enabled: false },
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
        },
      });

      portalConfigId = config.id;
      assistant.log(`Created Stripe portal config: ${portalConfigId}`);
    }

    // Build session params
    const sessionParams = {
      customer: customer.id,
      configuration: portalConfigId,
    };

    if (returnUrl) {
      sessionParams.return_url = returnUrl;
    }

    const session = await stripe.billingPortal.sessions.create(sessionParams);

    assistant.log(`Stripe portal session created: uid=${uid}, customerId=${customer.id}, url=${session.url}`);

    return { url: session.url };
  },
};
