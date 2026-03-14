const powertools = require('node-powertools');

// Epoch zero timestamps (used as default/empty dates)
const EPOCH_ZERO = powertools.timestamp(new Date(0), { output: 'string' });
const EPOCH_ZERO_UNIX = powertools.timestamp(EPOCH_ZERO, { output: 'unix' });

// Chargebee billing_period_unit → unified frequency map
const UNIT_TO_FREQUENCY = { year: 'annually', month: 'monthly', week: 'weekly', day: 'daily' };

// Valid frequency suffixes for deterministic item_price_id parsing
const VALID_FREQUENCIES = ['monthly', 'annually', 'weekly', 'daily'];

// Cached config
let cachedConfig = null;

/**
 * Chargebee shared library
 * Provides API helpers, resource fetching, and unified transformations
 */
const Chargebee = {
  /**
   * Initialize or return the Chargebee config
   * API key from CHARGEBEE_API_KEY env; site from CHARGEBEE_SITE env (set by Manager from config)
   * @returns {{ apiKey: string, site: string, baseUrl: string }}
   */
  init() {
    if (cachedConfig) {
      return cachedConfig;
    }

    const apiKey = process.env.CHARGEBEE_API_KEY;

    if (!apiKey) {
      throw new Error('CHARGEBEE_API_KEY environment variable is required');
    }

    const site = process.env.CHARGEBEE_SITE;

    if (!site) {
      throw new Error('CHARGEBEE_SITE environment variable is required (set from config payment.processors.chargebee.site)');
    }

    cachedConfig = {
      apiKey,
      site,
      baseUrl: `https://${site}.chargebee.com/api/v2`,
    };

    return cachedConfig;
  },

  /**
   * Make an authenticated Chargebee API request
   * Chargebee uses Basic auth (apiKey as username, empty password)
   * POST/PUT bodies use application/x-www-form-urlencoded
   * Responses are JSON wrapped in a type key (e.g., { subscription: {...} })
   *
   * @param {string} endpoint - API path (e.g., '/subscriptions/sub_xxx')
   * @param {object} options - { method, body (object to form-encode), headers }
   * @returns {Promise<object>} Parsed JSON response
   */
  async request(endpoint, options = {}) {
    const config = this.init();
    const auth = Buffer.from(`${config.apiKey}:`).toString('base64');

    const fetchOptions = {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        ...options.headers,
      },
    };

    // Encode body as form data for POST/PUT
    if (options.body && typeof options.body === 'object') {
      fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      fetchOptions.body = encodeFormData(options.body);
    } else if (options.body) {
      fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      fetchOptions.body = options.body;
    }

    const response = await fetch(`${config.baseUrl}${endpoint}`, fetchOptions);

    // 204 No Content
    if (response.status === 204) {
      return {};
    }

    const data = await response.json();

    if (!response.ok) {
      const msg = data.message || data.error_description || JSON.stringify(data);
      const err = new Error(`Chargebee API ${response.status}: ${msg}`);
      err.statusCode = response.status;
      throw err;
    }

    return data;
  },

  /**
   * Fetch the latest resource from Chargebee's API
   * Falls back to the raw webhook payload if the API call fails
   *
   * @param {string} resourceType - 'subscription' or 'invoice'
   * @param {string} resourceId - Chargebee resource ID
   * @param {object} rawFallback - Fallback data from webhook payload
   * @param {object} context - Additional context
   * @returns {object} Full Chargebee resource object
   */
  async fetchResource(resourceType, resourceId, rawFallback, context) {
    try {
      if (resourceType === 'subscription') {
        const result = await this.request(`/subscriptions/${resourceId}`);
        return result.subscription || result;
      }

      if (resourceType === 'invoice') {
        const result = await this.request(`/invoices/${resourceId}`);
        return result.invoice || result;
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
   * Resolve UID from a Chargebee hosted page's pass_thru_content
   * Searches recent hosted pages for one whose subscription matches the given resourceId
   *
   * @param {string} resourceId - Chargebee subscription ID to match
   * @param {object} assistant - Assistant instance for logging
   * @returns {Promise<{ uid: string, orderId: string }|null>}
   */
  async resolveUidFromHostedPage(resourceId, assistant) {
    try {
      this.init();
      const result = await this.request('/hosted_pages?limit=25&sort_by[desc]=created_at');
      const pages = result?.list || [];

      for (const entry of pages) {
        const hp = entry.hosted_page;

        // Match by subscription ID in the hosted page content
        if (hp.content?.subscription?.id !== resourceId) {
          continue;
        }

        if (!hp.pass_thru_content) {
          continue;
        }

        try {
          const parsed = typeof hp.pass_thru_content === 'string'
            ? JSON.parse(hp.pass_thru_content)
            : hp.pass_thru_content;

          if (parsed.uid) {
            return { uid: parsed.uid, orderId: parsed.orderId || null };
          }
        } catch (e) {
          // Invalid JSON in pass_thru_content — skip
        }
      }

      return null;
    } catch (e) {
      assistant.log(`resolveUidFromHostedPage failed: ${e.message}`);
      return null;
    }
  },

  /**
   * Set meta_data on a Chargebee subscription and its customer via direct API calls
   * Used to backfill meta_data after resolving UID from pass_thru_content,
   * so future webhooks (renewals, cancellations) can resolve UID directly
   *
   * @param {object} resource - Fetched subscription resource (has .id and .customer_id)
   * @param {object} meta - { uid, orderId } to backfill on the subscription + customer
   */
  async setMetaData(resource, meta = {}) {
    this.init();
    const metaBody = { meta_data: JSON.stringify(meta) };

    // Backfill subscription
    await this.request(`/subscriptions/${resource.id}`, {
      method: 'POST',
      body: metaBody,
    });

    // Backfill customer
    if (resource.customer_id) {
      await this.request(`/customers/${resource.customer_id}`, {
        method: 'POST',
        body: metaBody,
      });
    }
  },

  /**
   * Extract the internal orderId from a Chargebee resource
   * Checks meta_data JSON first (new), then cf_clientorderid (legacy)
   *
   * @param {object} resource - Raw Chargebee resource
   * @returns {string|null}
   */
  getOrderId(resource) {
    const meta = parseMetaData(resource);

    if (meta.orderId) {
      return meta.orderId;
    }

    // Legacy: cf_clientorderid custom field
    return resource.cf_clientorderid || null;
  },

  /**
   * Extract the UID from a Chargebee resource
   * Checks meta_data JSON first (new), then cf_uid (legacy)
   *
   * @param {object} resource - Raw Chargebee resource
   * @returns {string|null}
   */
  getUid(resource) {
    const meta = parseMetaData(resource);

    if (meta.uid) {
      return meta.uid;
    }

    // Legacy: cf_uid custom field
    return resource.cf_uid || null;
  },

  /**
   * Extract refund details from a Chargebee payment_refunded webhook payload
   *
   * @param {object} raw - Raw Chargebee webhook payload
   * @returns {{ amount: string|null, currency: string, reason: string|null }}
   */
  getRefundDetails(raw) {
    const creditNote = raw?.content?.credit_note;
    const transaction = raw?.content?.transaction;

    // Credit note has the refund amount
    if (creditNote) {
      return {
        amount: creditNote.total ? (creditNote.total / 100).toFixed(2) : null,
        currency: creditNote.currency_code?.toUpperCase() || 'USD',
        reason: creditNote.reason_code || null,
      };
    }

    // Fall back to transaction
    if (transaction) {
      return {
        amount: transaction.amount ? (transaction.amount / 100).toFixed(2) : null,
        currency: transaction.currency_code?.toUpperCase() || 'USD',
        reason: null,
      };
    }

    return { amount: null, currency: 'USD', reason: null };
  },

  /**
   * Transform a raw Chargebee subscription object into the unified subscription shape
   *
   * @param {object} rawSubscription - Raw Chargebee subscription object
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

    const meta = parseMetaData(rawSubscription);

    const now = powertools.timestamp(new Date(), { output: 'string' });
    const nowUNIX = powertools.timestamp(now, { output: 'unix' });

    return {
      product: product,
      status: status,
      expires: expires,
      trial: trial,
      cancellation: cancellation,
      payment: {
        processor: 'chargebee',
        orderId: meta.orderId || rawSubscription.cf_clientorderid || null,
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
   * Transform a raw Chargebee one-time payment resource into a unified shape
   * One-time payments come through as non-recurring invoices
   *
   * @param {object} rawResource - Raw Chargebee invoice resource
   * @param {object} options
   * @returns {object} Unified one-time payment object
   */
  toUnifiedOneTime(rawResource, options) {
    options = options || {};
    const config = options.config || {};

    const now = powertools.timestamp(new Date(), { output: 'string' });
    const nowUNIX = powertools.timestamp(now, { output: 'unix' });

    // Try to resolve product from line items or meta_data
    const meta = parseMetaData(rawResource);
    const productId = meta.productId || null;
    const product = resolveProductOneTime(productId, config);
    const price = resolvePrice(productId, 'once', config);

    // Resolve status from invoice status
    let status = 'unknown';
    if (rawResource.status === 'paid') {
      status = 'completed';
    } else if (rawResource.status === 'payment_due' || rawResource.status === 'not_paid') {
      status = 'failed';
    } else if (rawResource.status) {
      status = rawResource.status;
    }

    return {
      product: product,
      status: status,
      payment: {
        processor: 'chargebee',
        orderId: meta.orderId || rawResource.cf_clientorderid || null,
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
   * Build the meta_data JSON string for Chargebee subscriptions
   *
   * @param {string} uid - User's Firebase UID
   * @param {string} orderId - Our internal order ID
   * @param {string} [productId] - Product ID (used for one-time payments)
   * @returns {string} JSON string
   */
  buildMetaData(uid, orderId, productId) {
    const data = { uid, orderId };

    if (productId) {
      data.productId = productId;
    }

    return JSON.stringify(data);
  },
};

/**
 * Parse the meta_data JSON from a Chargebee resource
 * Falls back to cf_* custom fields for legacy subscriptions
 *
 * @param {object} resource - Chargebee resource
 * @returns {{ uid: string|null, orderId: string|null, productId: string|null }}
 */
function parseMetaData(resource) {
  if (!resource) {
    return { uid: null, orderId: null, productId: null };
  }

  // Try meta_data JSON (new approach)
  const metaData = resource.meta_data;

  if (metaData) {
    try {
      const parsed = typeof metaData === 'string' ? JSON.parse(metaData) : metaData;
      return {
        uid: parsed.uid || null,
        orderId: parsed.orderId || null,
        productId: parsed.productId || null,
      };
    } catch (e) {
      // Invalid JSON — fall through to legacy
    }
  }

  // Legacy: cf_* custom fields
  return {
    uid: resource.cf_uid || null,
    orderId: resource.cf_clientorderid || null,
    productId: null,
  };
}

/**
 * Encode an object as application/x-www-form-urlencoded with bracket notation
 * Handles nested objects: { subscription: { plan_id: 'x' } } → subscription[plan_id]=x
 *
 * @param {object} params - Parameters to encode
 * @param {string} [prefix] - Parent key prefix
 * @returns {string} URL-encoded string
 */
function encodeFormData(params, prefix) {
  const parts = [];

  for (const [key, value] of Object.entries(params)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      parts.push(encodeFormData(value, fullKey));
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === 'object') {
          parts.push(encodeFormData(value[i], `${fullKey}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(value[i])}`);
        }
      }
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(value)}`);
    }
  }

  return parts.filter(Boolean).join('&');
}

/**
 * Map Chargebee subscription status to unified status
 *
 * | Chargebee Status | Unified Status |
 * |------------------|----------------|
 * | active           | active         |
 * | in_trial         | active         |
 * | non_renewing     | active         |
 * | future           | active         |
 * | paused           | suspended      |
 * | cancelled        | cancelled      |
 * | transferred      | cancelled      |
 */
function resolveStatus(raw) {
  const status = raw.status;

  if (status === 'active' || status === 'in_trial' || status === 'non_renewing' || status === 'future') {
    return 'active';
  }

  if (status === 'paused') {
    return 'suspended';
  }

  // cancelled, transferred, or anything else
  return 'cancelled';
}

/**
 * Resolve cancellation state from Chargebee subscription
 * non_renewing = pending cancellation (cancel at period end)
 * cancelled + cancelled_at = completed cancellation
 */
function resolveCancellation(raw) {
  // Pending cancellation: non_renewing status
  if (raw.status === 'non_renewing') {
    const periodEnd = raw.current_term_end
      ? powertools.timestamp(new Date(raw.current_term_end * 1000), { output: 'string' })
      : EPOCH_ZERO;

    return {
      pending: true,
      date: {
        timestamp: periodEnd,
        timestampUNIX: periodEnd !== EPOCH_ZERO
          ? powertools.timestamp(periodEnd, { output: 'unix' })
          : EPOCH_ZERO_UNIX,
      },
    };
  }

  // Already cancelled
  if (raw.cancelled_at) {
    const cancelledDate = powertools.timestamp(new Date(raw.cancelled_at * 1000), { output: 'string' });

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
 * Resolve trial state from Chargebee subscription
 * Uses trial_start/trial_end unix timestamps (same pattern as Stripe)
 */
function resolveTrial(raw) {
  const trialStart = raw.trial_start ? raw.trial_start * 1000 : 0;
  const trialEnd = raw.trial_end ? raw.trial_end * 1000 : 0;
  const activated = !!(trialStart && trialEnd);

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
 * Resolve billing frequency from Chargebee subscription
 *
 * Items model: parse suffix from deterministic item_price_id
 *   e.g., "somiibo-pro-monthly" → split('-').pop() → "monthly"
 *
 * Legacy Plans model: use billing_period_unit
 *   e.g., "month" → "monthly"
 */
function resolveFrequency(raw) {
  // Items model: parse from deterministic item_price_id
  const itemPriceId = raw.subscription_items?.[0]?.item_price_id;

  if (itemPriceId) {
    const suffix = itemPriceId.split('-').pop();

    if (VALID_FREQUENCIES.includes(suffix)) {
      return suffix;
    }
  }

  // Legacy Plans model: use billing_period_unit
  const unit = raw.billing_period_unit;

  return UNIT_TO_FREQUENCY[unit] || null;
}

/**
 * Resolve product by matching Chargebee subscription against config products
 *
 * Items model: subscription_items[0].item_price_id starts with product.chargebee.itemId + '-'
 *   e.g., "somiibo-pro-monthly".startsWith("somiibo-pro-") → match
 *
 * Legacy Plans model: plan_id matches product.chargebee.legacyPlanIds[]
 *   e.g., "somiibo-premium-monthly-1" in legacyPlanIds → match
 */
function resolveProduct(raw, config) {
  const itemPriceId = raw.subscription_items?.[0]?.item_price_id;
  const planId = raw.plan_id;

  if (!config.payment?.products) {
    return { id: 'basic', name: 'Basic' };
  }

  // Items model takes priority — check all products first
  if (itemPriceId) {
    for (const product of config.payment.products) {
      if (product.chargebee?.itemId && itemPriceId.startsWith(product.chargebee.itemId + '-')) {
        return { id: product.id, name: product.name || product.id };
      }
    }
  }

  // Legacy Plans model — fallback
  if (planId) {
    for (const product of config.payment.products) {
      if (product.chargebee?.legacyPlanIds?.includes(planId)) {
        return { id: product.id, name: product.name || product.id };
      }
    }
  }

  return { id: 'basic', name: 'Basic' };
}

/**
 * Resolve product for one-time payments by productId from metadata
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
 * Resolve subscription expiration from Chargebee data
 * Uses current_term_end (unix timestamp)
 */
function resolveExpires(raw) {
  const termEnd = raw.current_term_end;

  if (!termEnd) {
    return {
      timestamp: EPOCH_ZERO,
      timestampUNIX: EPOCH_ZERO_UNIX,
    };
  }

  const expiresDate = powertools.timestamp(new Date(termEnd * 1000), { output: 'string' });

  return {
    timestamp: expiresDate,
    timestampUNIX: powertools.timestamp(expiresDate, { output: 'unix' }),
  };
}

/**
 * Resolve subscription start date from Chargebee data
 * Uses started_at or created_at (unix timestamps)
 */
function resolveStartDate(raw) {
  const startTs = raw.started_at || raw.created_at;

  if (!startTs) {
    return {
      timestamp: EPOCH_ZERO,
      timestampUNIX: EPOCH_ZERO_UNIX,
    };
  }

  const startDate = powertools.timestamp(new Date(startTs * 1000), { output: 'string' });

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

module.exports = Chargebee;
