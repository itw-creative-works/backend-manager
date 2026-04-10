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
  async createIntent({ uid, orderId, product, productId, frequency, trial, discount, confirmationUrl, cancelUrl, assistant }) {
    // Initialize Stripe SDK
    const StripeLib = require('../../../../libraries/payment/processors/stripe.js');
    const stripe = StripeLib.init();

    const productType = product.type || 'subscription';

    // Resolve the Stripe price ID at runtime (fetches active prices from Stripe product)
    const priceId = await StripeLib.resolvePriceId(product, productType, frequency);

    // Resolve or create Stripe customer (keyed by uid in metadata)
    const email = assistant?.getUser()?.auth?.email || null;
    const customer = await StripeLib.resolveCustomer(uid, email, assistant);

    // Resolve Stripe coupon if discount is present
    let stripeCouponId = null;
    if (discount) {
      stripeCouponId = await resolveStripeCoupon(stripe, discount, assistant);
    }

    assistant.log(`Stripe checkout: type=${productType}, priceId=${priceId}, uid=${uid}, customerId=${customer.id}, trial=${trial}, trialDays=${product.trial?.days || 'none'}, discount=${discount?.code || 'none'}`);

    // Build session params based on product type
    let sessionParams;

    if (productType === 'subscription') {
      sessionParams = buildSubscriptionSession({ priceId, customer, uid, orderId, productId, frequency, trial, product, stripeCouponId, confirmationUrl, cancelUrl });
    } else {
      sessionParams = buildOneTimeSession({ priceId, customer, uid, orderId, productId, product, stripeCouponId, confirmationUrl, cancelUrl });
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
function buildSubscriptionSession({ priceId, customer, uid, orderId, productId, frequency, trial, product, stripeCouponId, confirmationUrl, cancelUrl }) {
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

  // Apply discount coupon (first payment only)
  if (stripeCouponId) {
    sessionParams.discounts = [{ coupon: stripeCouponId }];
  }

  return sessionParams;
}

/**
 * Build Stripe Checkout Session params for a one-time payment
 */
function buildOneTimeSession({ priceId, customer, uid, orderId, productId, stripeCouponId, confirmationUrl, cancelUrl }) {
  const sessionParams = {
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

  // Apply discount coupon
  if (stripeCouponId) {
    sessionParams.discounts = [{ coupon: stripeCouponId }];
  }

  return sessionParams;
}

/**
 * Resolve or create a Stripe coupon for a discount code
 * Uses a deterministic ID so the same code always maps to the same coupon
 */
async function resolveStripeCoupon(stripe, discount, assistant) {
  const couponId = `BEM_${discount.code}_${discount.percent}OFF_ONCE`;

  try {
    // Check if coupon already exists
    await stripe.coupons.retrieve(couponId);
    assistant.log(`Stripe coupon exists: ${couponId}`);
    return couponId;
  } catch (e) {
    if (e.code !== 'resource_missing') {
      throw e;
    }
  }

  // Create the coupon
  // Idempotency key uses the deterministic couponId so concurrent requests for
  // the same discount code don't race each other into a duplicate-create error.
  // Stripe returns the cached response for 24 hours.
  await stripe.coupons.create({
    id: couponId,
    percent_off: discount.percent,
    duration: 'once',
    name: `${discount.code} (${discount.percent}% off first payment)`,
  }, {
    idempotencyKey: `bem-coupon-${couponId}`,
  });

  assistant.log(`Stripe coupon created: ${couponId}`);
  return couponId;
}

