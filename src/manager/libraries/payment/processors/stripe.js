const powertools = require('node-powertools');

// Lazy singleton Stripe SDK instance
let stripeInstance = null;

// Epoch zero timestamps (used as default/empty dates)
const EPOCH_ZERO = powertools.timestamp(new Date(0), { output: 'string' });
const EPOCH_ZERO_UNIX = powertools.timestamp(EPOCH_ZERO, { output: 'unix' });

// Stripe interval → unified frequency map
const INTERVAL_TO_FREQUENCY = { year: 'annually', month: 'monthly', week: 'weekly', day: 'daily' };

/**
 * Stripe shared library
 * Provides SDK initialization, resource fetching, and unified transformations
 */
const Stripe = {
  /**
   * Initialize or return the Stripe SDK instance
   * @param {string} secretKey - Stripe secret key
   * @returns {object} Stripe SDK instance
   */
  init() {
    if (!stripeInstance) {
      const secretKey = process.env.STRIPE_SECRET_KEY;

      if (!secretKey) {
        throw new Error('STRIPE_SECRET_KEY environment variable is required');
      }

      stripeInstance = require('stripe')(secretKey);
    }

    return stripeInstance;
  },

  /**
   * Fetch the latest resource from Stripe's API
   * Falls back to the raw webhook payload if the API call fails
   *
   * @param {string} resourceType - 'subscription' | 'invoice' | 'session'
   * @param {string} resourceId - Stripe resource ID
   * @param {object} rawFallback - Fallback data from webhook payload
   * @param {object} context - Additional context (e.g., { admin })
   * @returns {object} Full Stripe resource object
   */
  async fetchResource(resourceType, resourceId, rawFallback, context) {
    const stripe = this.init();

    try {
      if (resourceType === 'subscription') {
        return await stripe.subscriptions.retrieve(resourceId);
      }

      if (resourceType === 'invoice') {
        return await stripe.invoices.retrieve(resourceId);
      }

      if (resourceType === 'session') {
        return await stripe.checkout.sessions.retrieve(resourceId);
      }

      throw new Error(`Unknown resource type: ${resourceType}`);
    } catch (e) {
      // If the API call fails but we have raw webhook data, use it
      if (rawFallback && Object.keys(rawFallback).length > 0) {
        return rawFallback;
      }

      throw e;
    }
  },

  /**
   * Extract the internal orderId from a Stripe resource
   *
   * @param {object} resource - Raw Stripe resource (subscription, session, invoice)
   * @returns {string|null}
   */
  getOrderId(resource) {
    return resource.metadata?.orderId || null;
  },

  /**
   * Transform a raw Stripe subscription object into the unified subscription shape
   * This produces the exact same object stored in users/{uid}.subscription
   *
   * @param {object} rawSubscription - Raw Stripe subscription object
   * @param {object} options
   * @param {object} options.config - BEM config (must contain products array)
   * @param {string} options.eventName - Name of the webhook event (e.g., 'customer.subscription.updated')
   * @param {string} options.eventId - ID of the webhook event (e.g., 'evt_xxx')
   * @returns {object} Unified subscription object
   */
  toUnifiedSubscription(rawSubscription, options) {
    options = options || {};
    const config = options.config || {};

    // Resolve status
    const status = resolveStatus(rawSubscription);

    // Resolve cancellation
    const cancellation = resolveCancellation(rawSubscription);

    // Resolve trial
    const trial = resolveTrial(rawSubscription);

    // Resolve frequency
    const frequency = resolveFrequency(rawSubscription);

    // Resolve product from price
    const product = resolveProduct(rawSubscription, config);

    // Resolve expiration
    const expires = resolveExpires(rawSubscription);

    // Resolve start date
    const startDate = resolveStartDate(rawSubscription);

    // Resolve price from config
    const price = resolvePrice(product.id, frequency, config);

    // Build the unified subscription object
    const now = powertools.timestamp(new Date(), { output: 'string' });
    const nowUNIX = powertools.timestamp(now, { output: 'unix' });

    return {
      product: product,
      status: status,
      expires: expires,
      trial: trial,
      cancellation: cancellation,
      payment: {
        processor: 'stripe',
        orderId: rawSubscription.metadata?.orderId || null,
        resourceId: rawSubscription.id || null,
        frequency: frequency,
        price: price,
        startDate: startDate,
        updatedBy: {
          event: {
            name: options.eventName || null,
            id: options.eventId || null,
          },
          date: {
            timestamp: now,
            timestampUNIX: nowUNIX,
          },
        },
      },
    };
  },

  /**
   * Find an existing Stripe customer by uid metadata, or create one
   *
   * @param {string} uid - User's UID
   * @param {string|null} email - User's email (used when creating a new customer)
   * @param {object} assistant - Assistant instance for logging
   * @returns {object} Stripe customer object
   */
  async resolveCustomer(uid, email, assistant) {
    const stripe = this.init();

    // Search for existing customer with this uid
    const search = await stripe.customers.search({
      query: `metadata['uid']:'${uid}'`,
      limit: 1,
    });

    if (search.data.length > 0) {
      const existing = search.data[0];
      assistant.log(`Found existing Stripe customer: ${existing.id}`);
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
    assistant.log(`Created new Stripe customer: ${customer.id}`);
    return customer;
  },

  /**
   * Resolve the Stripe price ID by fetching active prices from the Stripe product
   * and matching by interval + amount.
   *
   * @param {object} product - Product object from config (must have .prices and .stripe.productId)
   * @param {string} productType - 'subscription' or 'one-time'
   * @param {string} frequency - 'monthly', 'annually', etc. (subscriptions) — ignored for one-time
   * @returns {Promise<string>} Stripe price ID
   * @throws {Error} If product is archived, missing Stripe product ID, or no matching price found
   */
  async resolvePriceId(product, productType, frequency) {
    if (product.archived) {
      throw new Error(`Product ${product.id} is archived`);
    }

    const stripeProductId = product.stripe?.productId;

    if (!stripeProductId) {
      throw new Error(`No Stripe product ID for ${product.id}`);
    }

    const key = productType === 'subscription' ? frequency : 'once';
    const expectedAmount = product.prices?.[key];

    if (!expectedAmount) {
      throw new Error(`No price configured for ${product.id}/${key}`);
    }

    const amountCents = Math.round(expectedAmount * 100);

    // Fetch active prices from Stripe for this product
    const stripe = this.init();

    const prices = [];
    for await (const price of stripe.prices.list({ product: stripeProductId, active: true, limit: 100 })) {
      prices.push(price);
    }

    // Match by interval + amount
    if (productType === 'subscription') {
      const interval = frequency === 'annually' ? 'year' : 'month';
      const match = prices.find(p =>
        p.recurring?.interval === interval
        && p.unit_amount === amountCents
      );

      if (!match) {
        throw new Error(`No active Stripe price for ${product.id}/${frequency} at $${expectedAmount} (product: ${stripeProductId})`);
      }

      return match.id;
    }

    // One-time: match by amount, no recurring
    const match = prices.find(p => !p.recurring && p.unit_amount === amountCents);

    if (!match) {
      throw new Error(`No active Stripe price for ${product.id}/once at $${expectedAmount} (product: ${stripeProductId})`);
    }

    return match.id;
  },

  /**
   * Transform a raw Stripe one-time payment resource into a unified shape
   * Mirrors subscription structure: { product, status, payment: { ... } }
   *
   * @param {object} rawResource - Raw Stripe resource (session, invoice, etc.)
   * @param {object} options
   * @returns {object} Unified one-time payment object
   */
  toUnifiedOneTime(rawResource, options) {
    options = options || {};
    const config = options.config || {};

    const now = powertools.timestamp(new Date(), { output: 'string' });
    const nowUNIX = powertools.timestamp(now, { output: 'unix' });

    // Resolve product + price from config
    const productId = rawResource.metadata?.productId;
    const product = resolveProductOneTime(productId, config);
    const price = resolvePrice(productId, 'once', config);

    return {
      product: product,
      status: rawResource.status || 'unknown',
      payment: {
        processor: 'stripe',
        orderId: rawResource.metadata?.orderId || null,
        resourceId: rawResource.id || null,
        price: price,
        updatedBy: {
          event: {
            name: options.eventName || null,
            id: options.eventId || null,
          },
          date: {
            timestamp: now,
            timestampUNIX: nowUNIX,
          },
        },
      },
    };
  },
};

/**
 * Map Stripe subscription status to unified status
 *
 * | Stripe Status        | Unified Status |
 * |----------------------|----------------|
 * | active               | active         |
 * | trialing             | active         |
 * | past_due             | suspended      |
 * | unpaid               | suspended      |
 * | canceled             | cancelled      |
 * | incomplete           | cancelled      |
 * | incomplete_expired   | cancelled      |
 */
function resolveStatus(raw) {
  const stripeStatus = raw.status;

  if (stripeStatus === 'active' || stripeStatus === 'trialing') {
    return 'active';
  }

  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') {
    return 'suspended';
  }

  // canceled, incomplete, incomplete_expired, or anything else
  return 'cancelled';
}

/**
 * Resolve cancellation state from Stripe subscription
 * Handles cancel_at_period_end for pending cancellations
 */
function resolveCancellation(raw) {
  // Pending cancellation: active but set to cancel at period end
  if (raw.cancel_at_period_end) {
    const periodEnd = raw.current_period_end || raw.items?.data?.[0]?.current_period_end || 0;
    const cancelAt = raw.cancel_at
      ? powertools.timestamp(new Date(raw.cancel_at * 1000), { output: 'string' })
      : powertools.timestamp(new Date(periodEnd * 1000), { output: 'string' });

    return {
      pending: true,
      date: {
        timestamp: cancelAt,
        timestampUNIX: powertools.timestamp(cancelAt, { output: 'unix' }),
      },
    };
  }

  // Already cancelled
  if (raw.canceled_at) {
    const cancelledDate = powertools.timestamp(new Date(raw.canceled_at * 1000), { output: 'string' });

    return {
      pending: false,
      date: {
        timestamp: cancelledDate,
        timestampUNIX: powertools.timestamp(cancelledDate, { output: 'unix' }),
      },
    };
  }

  // No cancellation
  return {
    pending: false,
    date: {
      timestamp: EPOCH_ZERO,
      timestampUNIX: EPOCH_ZERO_UNIX,
    },
  };
}

/**
 * Resolve trial state from Stripe subscription
 */
function resolveTrial(raw) {
  const trialStart = raw.trial_start ? raw.trial_start * 1000 : 0;
  const trialEnd = raw.trial_end ? raw.trial_end * 1000 : 0;
  const activated = !!(trialStart && trialEnd);

  // Build trial expiration
  let trialExpires = { timestamp: EPOCH_ZERO, timestampUNIX: EPOCH_ZERO_UNIX };
  if (trialEnd) {
    const trialEndDate = powertools.timestamp(new Date(trialEnd), { output: 'string' });
    trialExpires = {
      timestamp: trialEndDate,
      timestampUNIX: powertools.timestamp(trialEndDate, { output: 'unix' }),
    };
  }

  return {
    claimed: activated,
    expires: trialExpires,
  };
}

/**
 * Resolve billing frequency from Stripe subscription
 */
function resolveFrequency(raw) {
  // Stripe stores interval on the plan/price object
  const interval = raw.plan?.interval
    || raw.items?.data?.[0]?.price?.recurring?.interval
    || null;

  return INTERVAL_TO_FREQUENCY[interval] || null;
}

/**
 * Resolve product by matching the Stripe product ID against config products
 * Returns { id, name } — falls back to basic if no match is found
 */
function resolveProduct(raw, config) {
  // Get the Stripe product ID from the subscription
  const stripeProductId = raw.items?.data?.[0]?.price?.product
    || raw.plan?.product
    || null;

  if (!stripeProductId || !config.payment?.products) {
    return { id: 'basic', name: 'Basic' };
  }

  for (const product of config.payment.products) {
    // Match current product ID
    if (product.stripe?.productId === stripeProductId) {
      return { id: product.id, name: product.name || product.id };
    }

    // Match legacy product IDs (pre-migration Stripe products)
    if (product.stripe?.legacyProductIds?.includes(stripeProductId)) {
      return { id: product.id, name: product.name || product.id };
    }
  }

  // No match found
  return { id: 'basic', name: 'Basic' };
}

/**
 * Resolve product for one-time payments by matching productId from metadata
 * Returns { id, name } — falls back to 'unknown' if no match is found
 */
function resolveProductOneTime(productId, config) {
  if (!productId || !config.payment?.products) {
    return { id: productId || 'unknown', name: 'Unknown' };
  }

  const product = config.payment.products.find(p => p.id === productId);

  if (!product) {
    return { id: productId, name: productId };
  }

  return { id: product.id, name: product.name || product.id };
}

/**
 * Resolve subscription expiration from Stripe data
 */
function resolveExpires(raw) {
  // Stripe API 2025+ moves period dates to items.data[0]
  const periodEndRaw = raw.current_period_end
    || raw.items?.data?.[0]?.current_period_end
    || 0;

  const periodEnd = periodEndRaw
    ? powertools.timestamp(new Date(periodEndRaw * 1000), { output: 'string' })
    : EPOCH_ZERO;

  return {
    timestamp: periodEnd,
    timestampUNIX: periodEnd !== EPOCH_ZERO
      ? powertools.timestamp(periodEnd, { output: 'unix' })
      : EPOCH_ZERO_UNIX,
  };
}

/**
 * Resolve subscription start date from Stripe data
 */
function resolveStartDate(raw) {
  const startDate = raw.start_date
    ? powertools.timestamp(new Date(raw.start_date * 1000), { output: 'string' })
    : EPOCH_ZERO;

  return {
    timestamp: startDate,
    timestampUNIX: startDate !== EPOCH_ZERO
      ? powertools.timestamp(startDate, { output: 'unix' })
      : EPOCH_ZERO_UNIX,
  };
}

/**
 * Resolve the display price for a product/frequency from config
 *
 * @param {string} productId - Product ID (e.g., 'premium')
 * @param {string} frequency - 'monthly', 'annually', or 'once'
 * @param {object} config - App config
 * @returns {number} Price amount (e.g., 4.99) or 0
 */
function resolvePrice(productId, frequency, config) {
  const product = config.payment?.products?.find(p => p.id === productId);

  if (!product || !product.prices) {
    return 0;
  }

  return product.prices[frequency] || 0;
}

module.exports = Stripe;
