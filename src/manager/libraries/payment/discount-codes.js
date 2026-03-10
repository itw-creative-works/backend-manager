/**
 * Discount codes — hardcoded for now, move to Firestore/config later
 *
 * Each code maps to a discount definition:
 *   - percent: Percentage off (1-100)
 *   - duration: 'once' (first payment only)
 */
const DISCOUNT_CODES = {
  'FLASH20': { percent: 20, duration: 'once' },
  'SAVE10': { percent: 10, duration: 'once' },
  'WELCOME15': { percent: 15, duration: 'once' },
};

/**
 * Validate a discount code
 * @param {string} code - The discount code (case-insensitive)
 * @returns {{ valid: boolean, code: string, percent: number, duration: string } | { valid: boolean, code: string }}
 */
function validate(code) {
  const normalized = (code || '').trim().toUpperCase();

  if (!normalized) {
    return { valid: false, code: normalized };
  }

  const entry = DISCOUNT_CODES[normalized];

  if (!entry) {
    return { valid: false, code: normalized };
  }

  return {
    valid: true,
    code: normalized,
    percent: entry.percent,
    duration: entry.duration,
  };
}

module.exports = { validate, DISCOUNT_CODES };
