/**
 * Shared constants for email libraries (transactional + marketing)
 *
 * SSOT for templates, ASM groups, and semantic senders.
 * Used by: transactional/index.js, marketing/index.js, providers/*
 */

// Template shortcut map — callers use readable paths instead of SendGrid IDs
// Paths mirror the email website structure: {category}/{subcategory}/{name}
const TEMPLATES = {
  // v2 templates
  'main/basic/card': 'd-1cd2eee44b6340268c964cd7971d49b9',
  'main/engagement/feedback': 'd-319ab5c9d5074b21926a93562d6f41f6',
  'main/misc/app-download-link': 'd-fc8b4834d7e1472896fe7e46152029f4',
  'main/order/confirmation': 'd-5371ac2b4e3b490bbce51bfc2922ece8',
  'main/order/payment-failed': 'd-e56af0ac62364bfb9e50af02854e2cd3',
  'main/order/payment-recovered': 'd-d6dbd17a260a4755b34a852ba09c2454',
  'main/order/cancellation-requested': 'd-78074f3e8c844146bf263b86fc8d5ecf',
  'main/order/cancelled': 'd-39041132e6b24e5ebf0e95bce2d94dba',
  'main/order/plan-changed': 'd-399086311bbb48b4b77bc90b20fb9d0a',
  'main/order/trial-ending': 'd-af8ab499cbfb4d56918b4118f44343b0',
  'main/order/refunded': 'd-aa47fdbffa2b4ca9b73b6256e963e49f',
  'main/order/abandoned-cart': 'd-d8b3fa67e2b44b398dc280d0576bf1b7',
};

// "default" resolves to the basic card template
TEMPLATES['default'] = TEMPLATES['main/basic/card'];

// Group shortcut map — SendGrid ASM group IDs
// Rename these in SendGrid dashboard to match the comments
const GROUPS = {
  'orders': 16223,         // BEM - Order Updates
  'hello': 35092,          // BEM - Onboarding
  'account': 25927,        // BEM - Account
  'marketing': 25928,      // BEM - Marketing & Promotions
  'newsletter': 28096,     // BEM - Newsletter
  'security': 35093,       // BEM - Security
  'internal': 35094,       // BEM - Internal Alerts
};

// Semantic sender categories — pass `sender: 'orders'` to auto-resolve from address, display name, and ASM group
const SENDERS = {
  // Payment receipts, failed/recovered, cancellation, plan changes, refunds, trial ending
  orders: {
    localPart: 'orders',
    displayName: '{brand} Orders',
    group: GROUPS['orders'],
  },
  // Warm onboarding: welcome, 7-day checkup, feedback request
  hello: {
    localPart: 'hello',
    displayName: '{brand}',
    group: GROUPS['hello'],
  },
  // Transactional account actions: deletion, data requests
  account: {
    localPart: 'account',
    displayName: '{brand} Account',
    group: GROUPS['account'],
  },
  // Promotions, discounts, win-back, abandoned cart, app download link
  marketing: {
    localPart: 'offers',
    displayName: '{brand}',
    group: GROUPS['marketing'],
  },
  // Forgot password, 2FA, password reset
  security: {
    localPart: 'security',
    displayName: '{brand} Security',
    group: GROUPS['security'],
  },
  // Monthly newsletters, feature announcements, industry news
  newsletter: {
    localPart: 'newsletter',
    displayName: '{brand}',
    group: GROUPS['newsletter'],
  },
  // Dispute alerts, system notifications sent to brand contact
  internal: {
    localPart: 'alerts',
    displayName: '{brand} Alerts',
    group: GROUPS['internal'],
  },
};


// SendGrid limit for scheduled emails (72 hours, but use 71 for buffer)
const SEND_AT_LIMIT = 71;

/**
 * Convert SVG image URLs to PNG equivalents — email clients don't render SVGs.
 * CDN naming convention: `-x.svg` -> `-1024.png`
 */
function sanitizeImagesForEmail(images) {
  const result = {};

  for (const [key, value] of Object.entries(images)) {
    if (typeof value === 'string' && value.endsWith('.svg')) {
      result[key] = value.replace(/-x\.svg$/, '-1024.png');
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * URL-encode a value as base64
 */
function encode(s) {
  return encodeURIComponent(Buffer.from(String(s)).toString('base64'));
}

/**
 * Create an Error with a code property for distinguishing build (400) vs send (500) failures.
 */
function errorWithCode(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// Master field dictionary — SSOT for all marketing custom fields.
//
// SendGrid: `display` is the custom field name (created by OMEGA, resolved by ID at runtime).
// Beehiiv: `display` is the custom field name (matched by display name).
//
// Source types:
//   'user'     — read from user doc via _.get(userDoc, path)
//   'resolved' — read from User.resolveSubscription() output via path
//   'config'   — read from Manager.config via _.get(config, path)
//
// To add a new tracked marketing field:
//   1. Add an entry here (key, display, source, path, type)
//   2. Run OMEGA: npm start -- --service=sendgrid,beehiiv --brand=X
//   3. BEM resolves field IDs at runtime — no provider code changes needed
//   4. If 'resolved' source, ensure resolveFieldValues() computes it
//
// Flags:
//   skip — Array of provider names to skip field creation for (e.g., ['sendgrid'])
//          SendGrid has first_name/last_name as built-in contact fields
//          Beehiiv needs them created as custom fields (preset templates)
const FIELDS = {
  // Brand
  brand_id:                              { display: 'Brand ID', source: 'config', path: 'brand.id', type: 'text' },

  // User identity
  user_auth_uid:                         { display: 'User UID', source: 'user', path: 'auth.uid', type: 'text' },
  user_personal_name_first:              { display: 'First Name', source: 'user', path: 'personal.name.first', type: 'text', skip: ['sendgrid'] },
  user_personal_name_last:               { display: 'Last Name', source: 'user', path: 'personal.name.last', type: 'text', skip: ['sendgrid'] },
  user_personal_company:                 { display: 'Company', source: 'user', path: 'personal.company.name', type: 'text' },
  user_personal_country:                 { display: 'Country', source: 'user', path: 'personal.location.country', type: 'text' },
  user_metadata_signup_date:             { display: 'Signup Date', source: 'user', path: 'metadata.created.timestamp', type: 'date' },
  user_metadata_last_activity:           { display: 'Last Activity', source: 'user', path: 'metadata.updated.timestamp', type: 'date' },

  // Subscription
  user_subscription_plan:                { display: 'Plan', source: 'resolved', path: 'plan', type: 'text' },
  user_subscription_status:              { display: 'Status', source: 'resolved', path: 'status', type: 'text' },
  user_subscription_trialing:            { display: 'Trialing', source: 'resolved', path: 'trialing', type: 'text' },
  user_subscription_cancelling:          { display: 'Cancelling', source: 'resolved', path: 'cancelling', type: 'text' },
  user_subscription_ever_paid:           { display: 'Ever Paid', source: 'resolved', path: 'everPaid', type: 'text' },
  user_subscription_payment_processor:   { display: 'Payment Processor', source: 'user', path: 'subscription.payment.processor', type: 'text' },
  user_subscription_payment_frequency:   { display: 'Payment Frequency', source: 'user', path: 'subscription.payment.frequency', type: 'text' },
  user_subscription_payment_price:       { display: 'Payment Price', source: 'user', path: 'subscription.payment.price', type: 'number' },
  user_subscription_payment_last_date:   { display: 'Last Payment Date', source: 'user', path: 'subscription.payment.updatedBy.date.timestamp', type: 'date' },

  // Attribution
  user_attribution_utm_source:           { display: 'UTM Source', source: 'user', path: 'attribution.utm.tags.utm_source', type: 'text' },
};


/**
 * Resolve all field values from a user doc + config.
 * Returns a map of semantic field names → resolved values (type-coerced).
 * Providers use this internally to build their native field format.
 *
 * @param {object} userDoc - User document from Firestore
 * @param {object} config - Manager.config
 * @returns {object} Map of semantic name → value (e.g., { plan: 'basic', status: 'active', ... })
 */
const _ = require('lodash');
const User = require('../../helpers/user.js');

function resolveFieldValues(userDoc, config) {
  const resolved = User.resolveSubscription(userDoc);
  const subscription = userDoc.subscription || {};

  // Computed values from resolveSubscription() + raw status
  const resolvedValues = {
    plan: resolved.plan,
    status: subscription.status || 'active',
    everPaid: String(resolved.everPaid),
    trialing: String(resolved.trialing),
    cancelling: String(resolved.cancelling),
  };

  const result = {};

  for (const [name, fieldConfig] of Object.entries(FIELDS)) {
    let value;

    if (fieldConfig.source === 'config') {
      value = _.get(config, fieldConfig.path);
    } else if (fieldConfig.source === 'resolved') {
      value = resolvedValues[fieldConfig.path];
    } else {
      value = _.get(userDoc, fieldConfig.path);
    }

    if (value == null) {
      continue;
    }

    // Coerce booleans to strings for text fields
    if (fieldConfig.type === 'text' && typeof value === 'boolean') {
      value = String(value);
    }

    // Coerce to number for number fields
    if (fieldConfig.type === 'number' && typeof value !== 'number') {
      value = Number(value) || 0;
    }

    // Skip epoch default dates (1970-01-01)
    if (fieldConfig.type === 'date' && (!value || value === '1970-01-01T00:00:00.000Z')) {
      continue;
    }

    result[name] = value;
  }

  return result;
}

module.exports = {
  TEMPLATES,
  GROUPS,
  SENDERS,
  FIELDS,
  SEND_AT_LIMIT,
  sanitizeImagesForEmail,
  encode,
  errorWithCode,
  resolveFieldValues,
};
