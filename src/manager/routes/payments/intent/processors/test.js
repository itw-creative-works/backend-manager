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
   * @param {string} options.productId - Product ID from config
   * @param {string} options.frequency - 'monthly' or 'annually'
   * @param {boolean} options.trial - Whether to include a trial period
   * @param {object} options.config - BEM config
   * @param {object} options.Manager - Manager instance
   * @param {object} options.assistant - Assistant instance
   * @returns {object} { id, url, raw }
   */
  async createIntent({ uid, productId, frequency, trial, config, Manager, assistant }) {
    // Guard: test processor is not available in production
    if (assistant.isProduction()) {
      throw new Error('Test processor is not available in production');
    }

    // Find the product in config
    const product = (config.payment?.products || []).find(p => p.id === productId);
    if (!product) {
      throw new Error(`Product '${productId}' not found in config`);
    }

    // Get the price ID for the requested frequency (needed for product resolution in toUnified)
    const priceId = product.prices?.[frequency]?.stripe;
    if (!priceId) {
      throw new Error(`No Stripe price found for ${productId}/${frequency}`);
    }

    // Generate IDs
    const timestamp = Date.now();
    const sessionId = `_test-cs-${timestamp}`;
    const subscriptionId = `_test-sub-${timestamp}`;
    const eventId = `_test-evt-${timestamp}`;

    // Map frequency to Stripe interval
    const interval = frequency === 'annually' ? 'year' : 'month';

    // Build timestamps
    const now = Math.floor(timestamp / 1000);
    const periodEnd = frequency === 'annually'
      ? now + (365 * 86400)
      : now + (30 * 86400);

    // Build Stripe-shaped subscription object
    const subscription = {
      id: subscriptionId,
      object: 'subscription',
      status: trial && product.trial?.days ? 'trialing' : 'active',
      metadata: { uid },
      plan: { id: priceId, interval },
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

    assistant?.log(`Test intent: sessionId=${sessionId}, subscriptionId=${subscriptionId}, eventId=${eventId}, trial=${!!subscription.trial_start}`);

    // Auto-fire webhook (fire-and-forget — don't block intent response)
    const webhookUrl = `${Manager.project.apiUrl}/backend-manager/payments/webhook?processor=test&key=${process.env.BACKEND_MANAGER_KEY}`;
    fetch(webhookUrl, {
      method: 'POST',
      response: 'json',
      body: event,
      timeout: 15000,
    }).catch((e) => {
      assistant?.log(`Test processor auto-webhook failed: ${e.message}`);
    });

    return {
      id: sessionId,
      url: `${config.brand?.url || 'https://example.com'}/payment/confirmation?session=${sessionId}`,
      raw: { id: sessionId, object: 'checkout.session', subscription: subscriptionId },
    };
  },
};
