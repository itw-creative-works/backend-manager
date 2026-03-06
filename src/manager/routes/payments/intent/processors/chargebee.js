/**
 * Chargebee intent processor
 * Creates Chargebee Hosted Page sessions for subscription and one-time purchases
 */
module.exports = {
  /**
   * Create a Chargebee Hosted Page checkout session
   *
   * @param {object} options
   * @param {string} options.uid - User's UID
   * @param {string} options.orderId - BEM order ID (XXXX-XXXX-XXXX)
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
    const ChargebeeLib = require('../../../../libraries/payment/processors/chargebee.js');
    ChargebeeLib.init();

    const productType = product.type || 'subscription';
    const metaData = ChargebeeLib.buildMetaData(uid, orderId, productType === 'one-time' ? productId : undefined);

    let hostedPage;

    if (productType === 'subscription') {
      hostedPage = await createSubscriptionCheckout({ ChargebeeLib, uid, orderId, product, productId, frequency, trial, metaData, confirmationUrl, cancelUrl, assistant });
    } else {
      hostedPage = await createOneTimeCheckout({ ChargebeeLib, uid, orderId, product, productId, metaData, confirmationUrl, cancelUrl, assistant });
    }

    assistant.log(`Chargebee hosted page created: id=${hostedPage.id}, type=${productType}, url=${hostedPage.url}`);

    return {
      id: hostedPage.id,
      url: hostedPage.url,
      raw: hostedPage,
    };
  },
};

/**
 * Create a Chargebee Hosted Page for a new subscription
 */
async function createSubscriptionCheckout({ ChargebeeLib, uid, orderId, product, productId, frequency, trial, metaData, confirmationUrl, cancelUrl, assistant }) {
  const chargebeeItemId = product.chargebee?.itemId;

  if (!chargebeeItemId) {
    throw new Error(`No Chargebee item ID configured for product ${productId}`);
  }

  // Deterministic item price ID: {itemId}-{frequency}
  const itemPriceId = `${chargebeeItemId}-${frequency}`;

  const params = {
    subscription_items: {
      item_price_id: [itemPriceId],
      quantity: [1],
    },
    subscription: {
      meta_data: metaData,
    },
    redirect_url: confirmationUrl,
    cancel_url: cancelUrl,
    pass_thru_content: metaData,
  };

  // Handle trial: if trial requested but product has no trial config in Chargebee,
  // set trial_end explicitly. Otherwise let the item price's trial config handle it.
  if (trial === false && product.trial?.days) {
    // Explicitly skip trial by setting trial_end to 0
    params.subscription.trial_end = 0;
  }

  assistant.log(`Chargebee subscription checkout: itemPriceId=${itemPriceId}, uid=${uid}, trial=${trial}`);

  const result = await ChargebeeLib.request('/hosted_pages/checkout_new_for_items', {
    method: 'POST',
    body: params,
  });

  return result.hosted_page;
}

/**
 * Create a Chargebee Hosted Page for a one-time charge
 */
async function createOneTimeCheckout({ ChargebeeLib, uid, orderId, product, productId, metaData, confirmationUrl, cancelUrl, assistant }) {
  const price = product.prices?.once;

  if (!price) {
    throw new Error(`No one-time price configured for product ${productId}`);
  }

  // Amount in cents
  const amountCents = Math.round(price * 100);

  const params = {
    charges: {
      amount: [amountCents],
      description: [product.name || productId],
    },
    redirect_url: confirmationUrl,
    cancel_url: cancelUrl,
    pass_thru_content: metaData,
  };

  assistant.log(`Chargebee one-time checkout: amount=${amountCents}, productId=${productId}, uid=${uid}`);

  const result = await ChargebeeLib.request('/hosted_pages/checkout_one_time_for_items', {
    method: 'POST',
    body: params,
  });

  return result.hosted_page;
}
