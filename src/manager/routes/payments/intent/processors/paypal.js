/**
 * PayPal intent processor
 * Creates PayPal subscriptions (Billing API) and one-time orders (Orders API v2)
 */
module.exports = {
  /**
   * Create a PayPal payment intent (subscription or one-time order)
   *
   * @param {object} options
   * @param {string} options.uid - User's UID
   * @param {string} options.orderId - Internal order ID
   * @param {object} options.product - Full product object from config
   * @param {string} options.productId - Product ID from config (e.g., 'premium')
   * @param {string} options.frequency - 'monthly' or 'annually' (subscriptions only)
   * @param {boolean} options.trial - Whether to include a trial period
   * @param {string} options.confirmationUrl - Success redirect URL
   * @param {string} options.cancelUrl - Cancel redirect URL
   * @param {object} options.assistant - Assistant instance for logging
   * @returns {object} { id, url, raw }
   */
  async createIntent({ uid, orderId, product, productId, frequency, trial, confirmationUrl, cancelUrl, assistant }) {
    const PayPalLib = require('../../../../libraries/payment/processors/paypal.js');

    const productType = product.type || 'subscription';

    if (productType === 'subscription') {
      return createSubscriptionIntent({ uid, orderId, product, productId, frequency, trial, confirmationUrl, cancelUrl, assistant, PayPalLib });
    }

    return createOneTimeIntent({ uid, orderId, product, productId, confirmationUrl, cancelUrl, assistant, PayPalLib });
  },
};

/**
 * Create a PayPal subscription via the Billing Subscriptions API
 */
async function createSubscriptionIntent({ uid, orderId, product, productId, frequency, trial, confirmationUrl, cancelUrl, assistant, PayPalLib }) {
  // Resolve the PayPal plan ID at runtime (fetches plans from product, matches by interval + amount)
  const planId = await PayPalLib.resolvePlanId(product, frequency);

  assistant.log(`PayPal subscription: planId=${planId}, uid=${uid}, trial=${trial}, trialDays=${product.trial?.days || 'none'}`);

  // Build subscription request
  const subscriptionParams = {
    plan_id: planId,
    custom_id: PayPalLib.buildCustomId(uid, orderId),
    application_context: {
      brand_name: product.name || productId,
      return_url: confirmationUrl,
      cancel_url: cancelUrl,
      user_action: 'SUBSCRIBE_NOW',
      shipping_preference: 'NO_SHIPPING',
    },
  };

  // Add trial override if needed
  // If trial is requested and product has trial days, override the plan's setup
  // If trial is NOT requested but plan has trial, skip it by setting start_time to now
  if (trial && product.trial?.days) {
    // Let the plan's trial cycle handle it (if configured)
    // PayPal trials are configured on the plan, not at subscription creation
    assistant.log('PayPal trial: using plan trial cycle');
  } else if (!trial) {
    // Skip trial by starting billing immediately
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5); // PayPal requires start_time in future
    subscriptionParams.start_time = now.toISOString();
  }

  // Create the subscription
  const subscription = await PayPalLib.request('/v1/billing/subscriptions', {
    method: 'POST',
    body: JSON.stringify(subscriptionParams),
  });

  // Extract approval URL
  const approvalLink = subscription.links?.find(l => l.rel === 'approve');

  if (!approvalLink) {
    throw new Error('PayPal subscription created but no approval URL returned');
  }

  assistant.log(`PayPal subscription created: id=${subscription.id}, url=${approvalLink.href}`);

  return {
    id: subscription.id,
    url: approvalLink.href,
    raw: subscription,
  };
}

/**
 * Create a PayPal one-time order via the Orders API v2
 */
async function createOneTimeIntent({ uid, orderId, product, productId, confirmationUrl, cancelUrl, assistant, PayPalLib }) {
  if (product.archived) {
    throw new Error(`Product ${product.id} is archived`);
  }

  const amount = product.prices?.once;

  if (!amount) {
    throw new Error(`No one-time price configured for ${product.id}`);
  }

  const brandName = assistant.Manager?.config?.brand?.name || product.name || productId;

  const orderParams = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: {
        currency_code: 'USD',
        value: amount.toFixed(2),
      },
      description: product.name || productId,
      custom_id: PayPalLib.buildCustomId(uid, orderId, productId),
    }],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: brandName,
          return_url: confirmationUrl,
          cancel_url: cancelUrl,
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
        },
      },
    },
  };

  const order = await PayPalLib.request('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify(orderParams),
  });

  // Extract approval URL
  const approvalLink = order.links?.find(l => l.rel === 'payer-action' || l.rel === 'approve');

  if (!approvalLink) {
    throw new Error('PayPal order created but no approval URL returned');
  }

  assistant.log(`PayPal order created: id=${order.id}, url=${approvalLink.href}`);

  return {
    id: order.id,
    url: approvalLink.href,
    raw: order,
  };
}
