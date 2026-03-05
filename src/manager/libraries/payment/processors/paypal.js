const powertools = require('node-powertools');

// Epoch zero timestamps (used as default/empty dates)
const EPOCH_ZERO = powertools.timestamp(new Date(0), { output: 'string' });
const EPOCH_ZERO_UNIX = powertools.timestamp(EPOCH_ZERO, { output: 'unix' });

// PayPal interval → unified frequency map
const INTERVAL_TO_FREQUENCY = { YEAR: 'annually', MONTH: 'monthly', WEEK: 'weekly', DAY: 'daily' };
const FREQUENCY_TO_INTERVAL = { annually: 'YEAR', monthly: 'MONTH', weekly: 'WEEK', daily: 'DAY' };

// PayPal API base URLs
const LIVE_URL = 'https://api-m.paypal.com';
const SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

// Cached access token, expiry, and resolved base URL
let cachedToken = null;
let tokenExpiresAt = 0;
let resolvedBaseUrl = null;

/**
 * Try to authenticate against a specific PayPal endpoint
 * @param {string} auth - Base64-encoded client_id:secret
 * @param {string} baseUrl - PayPal API base URL
 * @returns {Promise<object|null>} Token data or null if auth failed
 */
async function tryAuth(auth, baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (e) {
    return null;
  }
}

/**
 * PayPal shared library
 * Provides API helpers, resource fetching, and unified transformations
 */
const PayPal = {
  /**
   * Initialize or return a PayPal access token
   * Tries both live and sandbox endpoints in parallel on first auth
   * @returns {Promise<string>} Access token
   */
  async init() {
    // Return cached token if still valid (with 60s buffer)
    if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
      return cachedToken;
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables are required');
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // First auth — try both endpoints in parallel to detect environment
    if (!resolvedBaseUrl) {
      const [liveResult, sandboxResult] = await Promise.all([
        tryAuth(auth, LIVE_URL),
        tryAuth(auth, SANDBOX_URL),
      ]);

      if (liveResult) {
        resolvedBaseUrl = LIVE_URL;
        cachedToken = liveResult.access_token;
        tokenExpiresAt = Date.now() + (liveResult.expires_in * 1000);
        return cachedToken;
      }

      if (sandboxResult) {
        resolvedBaseUrl = SANDBOX_URL;
        cachedToken = sandboxResult.access_token;
        tokenExpiresAt = Date.now() + (sandboxResult.expires_in * 1000);
        return cachedToken;
      }

      throw new Error('PayPal auth failed on both live and sandbox — check your client ID and secret');
    }

    // Subsequent auths — use the resolved endpoint
    const result = await tryAuth(auth, resolvedBaseUrl);

    if (!result) {
      throw new Error(`PayPal auth failed (${resolvedBaseUrl})`);
    }

    cachedToken = result.access_token;
    tokenExpiresAt = Date.now() + (result.expires_in * 1000);

    return cachedToken;
  },

  /**
   * Make an authenticated PayPal API request
   * @param {string} endpoint - API path (e.g., '/v1/billing/subscriptions/I-xxx')
   * @param {object} options - fetch options (method, body, etc.)
   * @returns {Promise<object>} Parsed JSON response
   */
  async request(endpoint, options = {}) {
    const token = await this.init();

    const response = await fetch(`${resolvedBaseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // 204 No Content
    if (response.status === 204) {
      return {};
    }

    const data = await response.json();

    if (!response.ok) {
      const msg = data.message || data.error_description || JSON.stringify(data);
      throw new Error(`PayPal API ${response.status}: ${msg}`);
    }

    return data;
  },

  /**
   * Fetch the latest resource from PayPal's API
   * Falls back to the raw webhook payload if the API call fails
   *
   * For orders: captures the payment first (moves funds), then returns the captured order
   *
   * @param {string} resourceType - 'subscription' or 'order'
   * @param {string} resourceId - PayPal resource ID (e.g., 'I-xxx' or order ID)
   * @param {object} rawFallback - Fallback data from webhook payload
   * @param {object} context - Additional context (e.g., { config })
   * @returns {object} Full PayPal resource object
   */
  async fetchResource(resourceType, resourceId, rawFallback, context) {
    try {
      if (resourceType === 'subscription') {
        const sub = await this.request(`/v1/billing/subscriptions/${resourceId}`);

        // Fetch the plan to get product_id (subscription doesn't include it)
        if (sub.plan_id) {
          try {
            const plan = await this.request(`/v1/billing/plans/${sub.plan_id}`);
            sub._plan = plan;
          } catch (e) {
            // Plan fetch failed — continue without it
          }
        }

        return sub;
      }

      if (resourceType === 'order') {
        // Capture the order to move funds, then return the captured state
        const captured = await this.request(`/v2/checkout/orders/${resourceId}/capture`, {
          method: 'POST',
        });

        return captured;
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
   * Transform a raw PayPal subscription object into the unified subscription shape
   *
   * @param {object} rawSubscription - Raw PayPal subscription object (with _plan attached)
   * @param {object} options
   * @param {object} options.config - BEM config (must contain products array)
   * @param {string} options.eventName - Name of the webhook event
   * @param {string} options.eventId - ID of the webhook event
   * @returns {object} Unified subscription object
   */
  toUnifiedSubscription(rawSubscription, options) {
    options = options || {};
    const config = options.config || {};

    const status = resolveStatus(rawSubscription);
    const cancellation = resolveCancellation(rawSubscription);
    const trial = resolveTrial(rawSubscription);
    const frequency = resolveFrequency(rawSubscription);
    const product = resolveProduct(rawSubscription, config);
    const expires = resolveExpires(rawSubscription);
    const startDate = resolveStartDate(rawSubscription);
    const price = resolvePrice(product.id, frequency, config);

    // Parse custom_id for uid and orderId
    const customData = parseCustomId(rawSubscription.custom_id);

    const now = powertools.timestamp(new Date(), { output: 'string' });
    const nowUNIX = powertools.timestamp(now, { output: 'unix' });

    return {
      product: product,
      status: status,
      expires: expires,
      trial: trial,
      cancellation: cancellation,
      payment: {
        processor: 'paypal',
        orderId: customData.orderId || null,
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
   * Transform a raw PayPal one-time payment resource into a unified shape
   *
   * @param {object} rawResource - Raw PayPal resource (capture, order, etc.)
   * @param {object} options
   * @returns {object} Unified one-time payment object
   */
  toUnifiedOneTime(rawResource, options) {
    options = options || {};
    const config = options.config || {};

    const now = powertools.timestamp(new Date(), { output: 'string' });
    const nowUNIX = powertools.timestamp(now, { output: 'unix' });

    // Resolve product from purchase_units custom_id (orders) or top-level custom_id (subscriptions)
    const purchaseCustomId = rawResource.purchase_units?.[0]?.custom_id;
    const customData = parseCustomId(purchaseCustomId || rawResource.custom_id);
    const productId = customData.productId;
    const product = resolveProductOneTime(productId, config);
    const price = resolvePrice(productId, 'once', config);

    return {
      product: product,
      status: rawResource.status === 'COMPLETED' ? 'complete' : rawResource.status?.toLowerCase() || 'unknown',
      payment: {
        processor: 'paypal',
        orderId: customData.orderId || null,
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

  /**
   * Resolve a PayPal plan ID from product config at runtime
   * Fetches plans for the PayPal product ID and matches by interval + amount
   *
   * @param {object} product - Product from config
   * @param {string} frequency - 'monthly', 'annually', etc.
   * @returns {Promise<string>} PayPal plan ID
   */
  async resolvePlanId(product, frequency) {
    if (product.archived) {
      throw new Error(`Product ${product.id} is archived`);
    }

    const paypalProductId = product.paypal?.productId;

    if (!paypalProductId) {
      throw new Error(`No PayPal product ID for ${product.id}`);
    }

    const expectedAmount = product.prices?.[frequency];

    if (!expectedAmount) {
      throw new Error(`No price configured for ${product.id}/${frequency}`);
    }

    // Fetch plans for this PayPal product
    const response = await this.request(`/v1/billing/plans?product_id=${paypalProductId}&page_size=20&total_required=true`);
    const plans = response.plans || [];

    // Map frequency to PayPal interval unit
    const intervalUnit = FREQUENCY_TO_INTERVAL[frequency] || 'MONTH';

    // Find matching active plan by interval + amount
    for (const plan of plans) {
      if (plan.status !== 'ACTIVE') {
        continue;
      }

      const cycle = plan.billing_cycles?.find(c => c.tenure_type === 'REGULAR');

      if (!cycle) {
        continue;
      }

      const planInterval = cycle.frequency?.interval_unit;
      const planAmount = parseFloat(cycle.pricing_scheme?.fixed_price?.value || '0');

      if (planInterval === intervalUnit && planAmount === expectedAmount) {
        return plan.id;
      }
    }

    throw new Error(`No active PayPal plan for ${product.id}/${frequency} at $${expectedAmount} (product: ${paypalProductId})`);
  },

  /**
   * Extract the internal orderId from a PayPal resource
   * Stripe stores orderId in resource.metadata.orderId, but PayPal stores it in custom_id
   *
   * @param {object} resource - Raw PayPal resource (subscription or order)
   * @returns {string|null}
   */
  getOrderId(resource) {
    const purchaseCustomId = resource.purchase_units?.[0]?.custom_id;
    const customData = parseCustomId(purchaseCustomId || resource.custom_id);
    return customData.orderId || null;
  },

  /**
   * Build the custom_id string for PayPal subscriptions and orders
   * Format: uid:{uid},orderId:{orderId} or uid:{uid},orderId:{orderId},productId:{productId}
   *
   * @param {string} uid - User's Firebase UID
   * @param {string} orderId - Our internal order ID
   * @param {string} [productId] - Product ID (used for one-time payments)
   * @returns {string}
   */
  buildCustomId(uid, orderId, productId) {
    let customId = `uid:${uid},orderId:${orderId}`;

    if (productId) {
      customId += `,productId:${productId}`;
    }

    return customId;
  },
};

/**
 * Parse the custom_id string from a PayPal subscription
 * Format: uid:{uid},orderId:{orderId}
 *
 * @param {string} customId - The custom_id string
 * @returns {{ uid: string|null, orderId: string|null, productId: string|null }}
 */
function parseCustomId(customId) {
  if (!customId) {
    return { uid: null, orderId: null, productId: null };
  }

  const result = { uid: null, orderId: null, productId: null };

  for (const part of customId.split(',')) {
    const [key, ...valueParts] = part.split(':');
    const value = valueParts.join(':'); // Handle values that contain colons

    if (key === 'uid') {
      result.uid = value || null;
    } else if (key === 'orderId') {
      result.orderId = value || null;
    } else if (key === 'productId') {
      result.productId = value || null;
    }
  }

  return result;
}

/**
 * Map PayPal subscription status to unified status
 *
 * | PayPal Status    | Unified Status |
 * |------------------|----------------|
 * | ACTIVE           | active         |
 * | SUSPENDED        | suspended      |
 * | CANCELLED        | cancelled      |
 * | EXPIRED          | cancelled      |
 * | APPROVAL_PENDING | cancelled      |
 * | APPROVED         | active         |
 */
function resolveStatus(raw) {
  const status = raw.status;

  if (status === 'ACTIVE' || status === 'APPROVED') {
    return 'active';
  }

  if (status === 'SUSPENDED') {
    return 'suspended';
  }

  // CANCELLED, EXPIRED, APPROVAL_PENDING, or anything else
  return 'cancelled';
}

/**
 * Resolve cancellation state from PayPal subscription
 */
function resolveCancellation(raw) {
  if (raw.status === 'CANCELLED') {
    // PayPal doesn't give a specific cancellation date on the sub itself
    // Use status_update_time if available
    const cancelDate = raw.status_update_time
      ? powertools.timestamp(new Date(raw.status_update_time), { output: 'string' })
      : EPOCH_ZERO;

    return {
      pending: false,
      date: {
        timestamp: cancelDate,
        timestampUNIX: cancelDate !== EPOCH_ZERO
          ? powertools.timestamp(cancelDate, { output: 'unix' })
          : EPOCH_ZERO_UNIX,
      },
    };
  }

  return {
    pending: false,
    date: {
      timestamp: EPOCH_ZERO,
      timestampUNIX: EPOCH_ZERO_UNIX,
    },
  };
}

/**
 * Resolve trial state from PayPal subscription
 * PayPal trials are represented as billing_cycles with tenure_type === 'TRIAL'
 */
function resolveTrial(raw) {
  // Check if the plan has a trial cycle
  const plan = raw._plan || {};
  const trialCycle = plan.billing_cycles?.find(c => c.tenure_type === 'TRIAL');

  if (!trialCycle) {
    return {
      claimed: false,
      expires: { timestamp: EPOCH_ZERO, timestampUNIX: EPOCH_ZERO_UNIX },
    };
  }

  // PayPal doesn't expose exact trial start/end dates on the subscription
  // We can calculate from start_time + trial duration
  const startTime = raw.start_time ? new Date(raw.start_time) : null;

  if (!startTime) {
    return {
      claimed: true,
      expires: { timestamp: EPOCH_ZERO, timestampUNIX: EPOCH_ZERO_UNIX },
    };
  }

  // Calculate trial end based on trial cycle frequency
  const trialFreq = trialCycle.frequency;
  const trialCount = trialCycle.total_cycles || 1;
  const trialEnd = new Date(startTime);

  if (trialFreq?.interval_unit === 'DAY') {
    trialEnd.setDate(trialEnd.getDate() + (trialFreq.interval_count || 1) * trialCount);
  } else if (trialFreq?.interval_unit === 'MONTH') {
    trialEnd.setMonth(trialEnd.getMonth() + (trialFreq.interval_count || 1) * trialCount);
  }

  const trialEndStr = powertools.timestamp(trialEnd, { output: 'string' });

  return {
    claimed: true,
    expires: {
      timestamp: trialEndStr,
      timestampUNIX: powertools.timestamp(trialEndStr, { output: 'unix' }),
    },
  };
}

/**
 * Resolve billing frequency from PayPal subscription
 */
function resolveFrequency(raw) {
  // Try _plan first (fetched separately)
  const plan = raw._plan || {};
  const regularCycle = plan.billing_cycles?.find(c => c.tenure_type === 'REGULAR');

  if (regularCycle?.frequency?.interval_unit) {
    return INTERVAL_TO_FREQUENCY[regularCycle.frequency.interval_unit] || null;
  }

  // Fallback: try inline plan info from ?fields=plan
  const inlinePlan = raw.plan;
  if (inlinePlan?.billing_cycles) {
    const cycle = inlinePlan.billing_cycles.find(c => c.tenure_type === 'REGULAR');
    if (cycle?.frequency?.interval_unit) {
      return INTERVAL_TO_FREQUENCY[cycle.frequency.interval_unit] || null;
    }
  }

  return null;
}

/**
 * Resolve product by matching the PayPal product ID against config products
 * Uses: sub._plan.product_id → match config product.paypal.productId
 */
function resolveProduct(raw, config) {
  // Get PayPal product ID from the plan (attached during fetchResource)
  const paypalProductId = raw._plan?.product_id || null;

  if (!paypalProductId || !config.payment?.products) {
    return { id: 'basic', name: 'Basic' };
  }

  for (const product of config.payment.products) {
    if (product.paypal?.productId === paypalProductId) {
      return { id: product.id, name: product.name || product.id };
    }
  }

  return { id: 'basic', name: 'Basic' };
}

/**
 * Resolve product for one-time payments
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
 * Resolve subscription expiration from PayPal data
 */
function resolveExpires(raw) {
  // PayPal's billing_info.next_billing_time is the closest to "period end"
  const nextBilling = raw.billing_info?.next_billing_time;

  if (!nextBilling) {
    return {
      timestamp: EPOCH_ZERO,
      timestampUNIX: EPOCH_ZERO_UNIX,
    };
  }

  const expiresDate = powertools.timestamp(new Date(nextBilling), { output: 'string' });

  return {
    timestamp: expiresDate,
    timestampUNIX: powertools.timestamp(expiresDate, { output: 'unix' }),
  };
}

/**
 * Resolve subscription start date from PayPal data
 */
function resolveStartDate(raw) {
  const startTime = raw.start_time || raw.create_time;

  if (!startTime) {
    return {
      timestamp: EPOCH_ZERO,
      timestampUNIX: EPOCH_ZERO_UNIX,
    };
  }

  const startDate = powertools.timestamp(new Date(startTime), { output: 'string' });

  return {
    timestamp: startDate,
    timestampUNIX: powertools.timestamp(startDate, { output: 'unix' }),
  };
}

/**
 * Resolve the display price for a product/frequency from config
 */
function resolvePrice(productId, frequency, config) {
  const product = config.payment?.products?.find(p => p.id === productId);

  if (!product || !product.prices) {
    return 0;
  }

  return product.prices[frequency] || 0;
}

module.exports = PayPal;
