/**
 * Discount codes — SSOT for all promo codes
 *
 * Each code maps to a discount definition:
 *   - percent: Percentage off (1-100)
 *   - duration: 'once' (first payment only)
 *   - eligible: Optional function (user) => boolean. If present, the code is only
 *     valid for users who pass this check. Receives the raw user doc or User instance.
 *     If omitted, the code is valid for everyone.
 */
const User = require('../../helpers/user.js');

const DISCOUNT_CODES = {
  // Website (displayed on pricing page, landing pages — no eligibility restrictions)
  'WELCOME15': { percent: 15, duration: 'once' },
  'SAVE10': { percent: 10, duration: 'once' },
  'FLASH20': { percent: 20, duration: 'once' },

  // Email campaigns (used by recurring sale seeds — restricted by audience)
  'UPGRADE15': {
    percent: 15,
    duration: 'once',
    eligible: (user) => {
      const sub = User.resolveSubscription(user);
      return sub.plan === 'basic';
    },
  },
  'COMEBACK20': {
    percent: 20,
    duration: 'once',
    eligible: (user) => {
      const sub = User.resolveSubscription(user);
      return sub.plan === 'basic' && user.subscription?.trial?.claimed === true;
    },
  },
  'MISSYOU25': {
    percent: 25,
    duration: 'once',
    eligible: (user) => {
      const sub = User.resolveSubscription(user);
      return sub.everPaid && user.subscription?.status === 'cancelled';
    },
  },
  'TRYAGAIN10': {
    percent: 10,
    duration: 'once',
    eligible: (user) => {
      return user.subscription?.status === 'cancelled';
    },
  },
};

/**
 * Validate a discount code, optionally checking user eligibility.
 *
 * @param {string} code - The discount code (case-insensitive)
 * @param {object} [user] - User doc or User instance. If provided and the code has
 *   an eligible() function, eligibility is checked. If not provided, eligibility is skipped.
 * @returns {{ valid: boolean, code: string, percent?: number, duration?: string, reason?: string }}
 */
function validate(code, user) {
  const normalized = (code || '').trim().toUpperCase();

  if (!normalized) {
    return { valid: false, code: normalized };
  }

  const entry = DISCOUNT_CODES[normalized];

  if (!entry) {
    return { valid: false, code: normalized };
  }

  // Check eligibility if user is provided and code has a restriction
  if (user && entry.eligible) {
    // Support both raw user doc and User instance (check .properties for User instance)
    const userDoc = user.properties || user;

    if (!entry.eligible(userDoc)) {
      return { valid: false, code: normalized, reason: 'not eligible' };
    }
  }

  return {
    valid: true,
    code: normalized,
    percent: entry.percent,
    duration: entry.duration,
  };
}

module.exports = { validate, DISCOUNT_CODES };
