/**
 * Stripe intent processor
 * Creates Stripe Checkout Sessions for subscription purchases
 */
module.exports = {
  /**
   * Create a Stripe Checkout Session for a subscription
   *
   * @param {object} options
   * @param {string} options.uid - User's UID
   * @param {string} options.productId - Product ID from config (e.g., 'premium')
   * @param {string} options.frequency - 'monthly' or 'annually'
   * @param {boolean} options.trial - Whether to include a trial period
   * @param {object} options.config - BEM config (must contain products array)
   * @param {object} options.Manager - Manager instance
   * @returns {object} { id, url, raw }
   */
  async createIntent({ uid, productId, frequency, trial, config, Manager, assistant }) {
    // Initialize Stripe SDK
    const StripeLib = require('../../../../libraries/stripe.js');
    const stripe = StripeLib.init();

    // Find the product in config
    const product = (config.payment?.products || []).find(p => p.id === productId);
    if (!product) {
      throw new Error(`Product '${productId}' not found in config`);
    }

    // Get the Stripe price ID for the requested frequency
    const priceId = product.prices?.[frequency]?.stripe;
    if (!priceId) {
      throw new Error(`No Stripe price found for ${productId}/${frequency}`);
    }

    // Resolve or create Stripe customer (keyed by uid in metadata)
    const email = assistant?.getUser()?.auth?.email || null;
    const customer = await resolveCustomer(stripe, uid, email, assistant);

    assistant?.log(`Stripe checkout: priceId=${priceId}, uid=${uid}, customerId=${customer.id}, trial=${trial}, trialDays=${product.trial?.days || 'none'}`);

    // Build confirmation redirect URL with order details
    const baseUrl = config.brand?.url;
    const amount = product.prices?.[frequency]?.amount || 0;

    const confirmationUrl = new URL('/payment/confirmation', baseUrl);
    confirmationUrl.searchParams.set('orderId', '{CHECKOUT_SESSION_ID}');
    confirmationUrl.searchParams.set('productId', productId);
    confirmationUrl.searchParams.set('productName', product.name || productId);
    confirmationUrl.searchParams.set('amount', trial && product.trial?.days ? '0' : String(amount));
    confirmationUrl.searchParams.set('currency', 'USD');
    confirmationUrl.searchParams.set('frequency', frequency);
    confirmationUrl.searchParams.set('paymentMethod', 'stripe');
    confirmationUrl.searchParams.set('trial', String(!!trial && !!product.trial?.days));
    confirmationUrl.searchParams.set('track', 'true');

    const cancelUrl = new URL('/payment/checkout', baseUrl);
    cancelUrl.searchParams.set('product', productId);
    cancelUrl.searchParams.set('frequency', frequency);
    cancelUrl.searchParams.set('payment', 'cancelled');

    // Build session params
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
        },
      },
      success_url: confirmationUrl.toString(),
      cancel_url: cancelUrl.toString(),
      metadata: {
        uid: uid,
        productId: productId,
        frequency: frequency,
      },
    };

    // Add trial period if requested
    if (trial && product.trial?.days) {
      sessionParams.subscription_data.trial_period_days = product.trial.days;
      assistant?.log(`Trial period added: ${product.trial.days} days`);
    }

    // Create the checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    assistant?.log(`Stripe session created: sessionId=${session.id}, url=${session.url}`);

    return {
      id: session.id,
      url: session.url,
      raw: session,
    };
  },
};

/**
 * Find an existing Stripe customer by uid metadata, or create one
 */
async function resolveCustomer(stripe, uid, email, assistant) {
  // Search for existing customer with this uid
  const search = await stripe.customers.search({
    query: `metadata['uid']:'${uid}'`,
    limit: 1,
  });

  if (search.data.length > 0) {
    const existing = search.data[0];
    assistant?.log(`Found existing Stripe customer: ${existing.id}`);
    return existing;
  }

  // Create new customer
  const params = {
    metadata: { uid },
  };

  if (email) {
    params.email = email;
  }

  const customer = await stripe.customers.create(params);
  assistant?.log(`Created new Stripe customer: ${customer.id}`);
  return customer;
}
