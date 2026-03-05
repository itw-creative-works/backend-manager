const fetch = require('wonderful-fetch');

/**
 * Test intent processor
 * Creates fake Stripe-shaped checkout sessions and auto-fires webhooks
 * Only available in non-production environments
 */
module.exports = {
  /**
   * Create a test payment intent
   * Generates Stripe-shaped data and auto-fires a webhook to trigger the full pipeline
   *
   * @param {object} options
   * @param {string} options.uid - User's UID
   * @param {object} options.product - Full product object from config
   * @param {string} options.productId - Product ID from config
   * @param {string} options.frequency - 'monthly', 'annually', 'weekly', or 'daily' (subscriptions only)
   * @param {boolean} options.trial - Whether to include a trial period (subscriptions only)
   * @param {string} options.confirmationUrl - Success redirect URL
   * @param {string} options.cancelUrl - Cancel redirect URL
   * @param {object} options.assistant - Assistant instance
   * @returns {object} { id, url, raw }
   */
  async createIntent({ uid, orderId, product, productId, frequency, trial, confirmationUrl, assistant }) {
    // Guard: test processor is not available in production
    if (assistant.isProduction()) {
      throw new Error('Test processor is not available in production');
    }

    const productType = product.type || 'subscription';

    if (productType === 'subscription') {
      return createSubscriptionIntent({ uid, orderId, product, frequency, trial, confirmationUrl, assistant });
    }

    return createOneTimeIntent({ uid, orderId, product, productId, confirmationUrl, assistant });
  },
};

/**
 * Create a test subscription intent
 * Generates Stripe-shaped subscription + customer.subscription.created event
 */
async function createSubscriptionIntent({ uid, orderId, product, frequency, trial, confirmationUrl, assistant }) {
  // Generate IDs
  const timestamp = Date.now();
  const sessionId = `_test-cs-${timestamp}`;
  const subscriptionId = `_test-sub-${timestamp}`;
  const eventId = `_test-evt-${timestamp}`;

  // Map frequency to Stripe interval
  const FREQUENCY_TO_INTERVAL = { annually: 'year', monthly: 'month', weekly: 'week', daily: 'day' };
  const FREQUENCY_TO_PERIOD = { annually: 365 * 86400, monthly: 30 * 86400, weekly: 7 * 86400, daily: 1 * 86400 };
  const interval = FREQUENCY_TO_INTERVAL[frequency] || 'month';

  // Build timestamps
  const now = Math.floor(timestamp / 1000);
  const periodEnd = now + (FREQUENCY_TO_PERIOD[frequency] || 30 * 86400);

  // Build Stripe-shaped subscription object
  // Uses product's Stripe product ID so resolveProduct() can match it
  const subscription = {
    id: subscriptionId,
    object: 'subscription',
    status: trial && product.trial?.days ? 'trialing' : 'active',
    metadata: { uid, orderId },
    plan: { product: product.stripe?.productId || null, interval },
    current_period_end: periodEnd,
    current_period_start: now,
    start_date: now,
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    trial_start: null,
    trial_end: null,
  };

  // Add trial dates if applicable
  if (trial && product.trial?.days) {
    subscription.trial_start = now;
    subscription.trial_end = now + (product.trial.days * 86400);
    subscription.current_period_end = subscription.trial_end;
  }

  // Build Stripe-shaped event
  const event = {
    id: eventId,
    type: 'customer.subscription.created',
    data: { object: subscription },
  };

  assistant.log(`Test subscription intent: sessionId=${sessionId}, subscriptionId=${subscriptionId}, eventId=${eventId}, trial=${!!subscription.trial_start}`);

  // Auto-fire webhook
  fireWebhook({ event, assistant });

  return {
    id: sessionId,
    url: confirmationUrl,
    raw: { id: sessionId, object: 'checkout.session', subscription: subscriptionId },
  };
}

/**
 * Create a test one-time payment intent
 * Generates Stripe-shaped checkout session + checkout.session.completed event
 */
async function createOneTimeIntent({ uid, orderId, product, productId, confirmationUrl, assistant }) {
  // Validate that a price exists
  if (!product.prices?.once) {
    throw new Error(`No one-time price configured for ${product.id}`);
  }

  // Generate IDs
  const timestamp = Date.now();
  const sessionId = `_test-cs-${timestamp}`;
  const eventId = `_test-evt-${timestamp}`;

  // Build Stripe-shaped checkout session object
  const session = {
    id: sessionId,
    object: 'checkout.session',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    metadata: { uid, orderId, productId },
    amount_total: Math.round((product.prices.once || 0) * 100),
    currency: 'usd',
  };

  // Build Stripe-shaped event
  const event = {
    id: eventId,
    type: 'checkout.session.completed',
    data: { object: session },
  };

  assistant.log(`Test one-time intent: sessionId=${sessionId}, eventId=${eventId}, productId=${productId}`);

  // Auto-fire webhook
  fireWebhook({ event, assistant });

  return {
    id: sessionId,
    url: confirmationUrl,
    raw: { id: sessionId, object: 'checkout.session', mode: 'payment' },
  };
}

/**
 * Fire-and-forget webhook to trigger the full pipeline
 */
function fireWebhook({ event, assistant }) {
  const webhookUrl = `${assistant.Manager.project.apiUrl}/backend-manager/payments/webhook?processor=test&key=${process.env.BACKEND_MANAGER_KEY}`;
  fetch(webhookUrl, {
    method: 'POST',
    response: 'json',
    body: event,
    timeout: 15000,
  }).catch((e) => {
    assistant.log(`Test processor auto-webhook failed: ${e.message}`);
  });
}
