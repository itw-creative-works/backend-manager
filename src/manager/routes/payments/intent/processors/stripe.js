const resolvePriceId = require('../../../../libraries/payment-processors/resolve-price-id.js');

/**
 * Stripe intent processor
 * Creates Stripe Checkout Sessions for subscription and one-time purchases
 */
module.exports = {
  /**
   * Create a Stripe Checkout Session
   *
   * @param {object} options
   * @param {string} options.uid - User's UID
   * @param {object} options.product - Full product object from config
   * @param {string} options.productId - Product ID from config (e.g., 'premium')
   * @param {string} options.frequency - 'monthly' or 'annually' (subscriptions only)
   * @param {boolean} options.trial - Whether to include a trial period (subscriptions only)
   * @param {string} options.confirmationUrl - Success redirect URL
   * @param {string} options.cancelUrl - Cancel redirect URL
   * @returns {object} { id, url, raw }
   */
  async createIntent({ uid, orderId, product, productId, frequency, trial, confirmationUrl, cancelUrl, assistant }) {
    // Initialize Stripe SDK
    const StripeLib = require('../../../../libraries/payment-processors/stripe.js');
    const stripe = StripeLib.init();

    const productType = product.type || 'subscription';

    // Resolve the Stripe price ID based on product type
    const priceId = resolvePriceId(product, productType, frequency);

    // Resolve or create Stripe customer (keyed by uid in metadata)
    const email = assistant?.getUser()?.auth?.email || null;
    const customer = await StripeLib.resolveCustomer(uid, email, assistant);

    assistant.log(`Stripe checkout: type=${productType}, priceId=${priceId}, uid=${uid}, customerId=${customer.id}, trial=${trial}, trialDays=${product.trial?.days || 'none'}`);

    // Build session params based on product type
    let sessionParams;

    if (productType === 'subscription') {
      sessionParams = buildSubscriptionSession({ priceId, customer, uid, orderId, productId, frequency, trial, product, confirmationUrl, cancelUrl });
    } else {
      sessionParams = buildOneTimeSession({ priceId, customer, uid, orderId, productId, product, confirmationUrl, cancelUrl });
    }

    // Create the checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    assistant.log(`Stripe session created: sessionId=${session.id}, mode=${sessionParams.mode}, url=${session.url}`);

    return {
      id: session.id,
      url: session.url,
      raw: session,
    };
  },
};

/**
 * Build Stripe Checkout Session params for a subscription
 */
function buildSubscriptionSession({ priceId, customer, uid, orderId, productId, frequency, trial, product, confirmationUrl, cancelUrl }) {
  const sessionParams = {
    mode: 'subscription',
    customer: customer.id,
    line_items: [{
      price: priceId,
      quantity: 1,
    }],
    subscription_data: {
      metadata: {
        uid: uid,
        orderId: orderId,
      },
    },
    success_url: confirmationUrl,
    cancel_url: cancelUrl,
    metadata: {
      uid: uid,
      orderId: orderId,
      productId: productId,
      frequency: frequency,
    },
  };

  // Add trial period if requested
  if (trial && product.trial?.days) {
    sessionParams.subscription_data.trial_period_days = product.trial.days;
  }

  return sessionParams;
}

/**
 * Build Stripe Checkout Session params for a one-time payment
 */
function buildOneTimeSession({ priceId, customer, uid, orderId, productId, product, confirmationUrl, cancelUrl }) {
  return {
    mode: 'payment',
    customer: customer.id,
    line_items: [{
      price: priceId,
      quantity: 1,
    }],
    payment_intent_data: {
      metadata: {
        uid: uid,
        orderId: orderId,
      },
    },
    success_url: confirmationUrl,
    cancel_url: cancelUrl,
    metadata: {
      uid: uid,
      orderId: orderId,
      productId: productId,
    },
  };
}

