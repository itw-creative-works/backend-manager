const powertools = require('node-powertools');

// Lazy singleton Stripe SDK instance
let stripeInstance = null;

/**
 * Stripe shared library
 * Provides SDK initialization and unified subscription transformation
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
  toUnified(rawSubscription, options) {
    options = options || {};
    const config = options.config || {};

    const oldDate = powertools.timestamp(new Date(0), { output: 'string' });
    const oldDateUNIX = powertools.timestamp(oldDate, { output: 'unix' });

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
    const expires = resolveExpires(rawSubscription, oldDate, oldDateUNIX);

    // Resolve start date
    const startDate = resolveStartDate(rawSubscription, oldDate, oldDateUNIX);

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
        resourceId: rawSubscription.id || null,
        frequency: frequency,
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
  const oldDate = powertools.timestamp(new Date(0), { output: 'string' });
  const oldDateUNIX = powertools.timestamp(oldDate, { output: 'unix' });

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
      timestamp: oldDate,
      timestampUNIX: oldDateUNIX,
    },
  };
}

/**
 * Resolve trial state from Stripe subscription
 */
function resolveTrial(raw) {
  const oldDate = powertools.timestamp(new Date(0), { output: 'string' });
  const oldDateUNIX = powertools.timestamp(oldDate, { output: 'unix' });

  const trialStart = raw.trial_start ? raw.trial_start * 1000 : 0;
  const trialEnd = raw.trial_end ? raw.trial_end * 1000 : 0;
  const activated = !!(trialStart && trialEnd);

  // Build trial expiration
  let trialExpires = { timestamp: oldDate, timestampUNIX: oldDateUNIX };
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

  if (interval === 'year') {
    return 'annually';
  }

  if (interval === 'month') {
    return 'monthly';
  }

  if (interval === 'week') {
    return 'weekly';
  }

  if (interval === 'day') {
    return 'daily';
  }

  return null;
}

/**
 * Resolve product by matching the Stripe price ID against config products
 * Returns { id, name } — falls back to basic if no match is found
 */
function resolveProduct(raw, config) {
  // Get the price ID from the subscription
  const priceId = raw.plan?.id
    || raw.items?.data?.[0]?.price?.id
    || null;

  if (!priceId || !config.payment?.products) {
    return { id: 'basic', name: 'Basic' };
  }

  // Search through products for a matching price ID
  for (const product of config.payment.products) {
    if (!product.prices) {
      continue;
    }

    for (const frequency of Object.keys(product.prices)) {
      if (product.prices[frequency]?.stripe === priceId) {
        return { id: product.id, name: product.name || product.id };
      }
    }
  }

  // No match found
  return { id: 'basic', name: 'Basic' };
}

/**
 * Resolve subscription expiration from Stripe data
 */
function resolveExpires(raw, oldDate, oldDateUNIX) {
  // Stripe API 2025+ moves period dates to items.data[0]
  const periodEndRaw = raw.current_period_end
    || raw.items?.data?.[0]?.current_period_end
    || 0;

  const periodEnd = periodEndRaw
    ? powertools.timestamp(new Date(periodEndRaw * 1000), { output: 'string' })
    : oldDate;

  return {
    timestamp: periodEnd,
    timestampUNIX: periodEnd !== oldDate
      ? powertools.timestamp(periodEnd, { output: 'unix' })
      : oldDateUNIX,
  };
}

/**
 * Resolve subscription start date from Stripe data
 */
function resolveStartDate(raw, oldDate, oldDateUNIX) {
  const startDate = raw.start_date
    ? powertools.timestamp(new Date(raw.start_date * 1000), { output: 'string' })
    : oldDate;

  return {
    timestamp: startDate,
    timestampUNIX: startDate !== oldDate
      ? powertools.timestamp(startDate, { output: 'unix' })
      : oldDateUNIX,
  };
}

module.exports = Stripe;
