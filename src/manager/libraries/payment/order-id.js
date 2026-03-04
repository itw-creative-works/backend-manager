const crypto = require('crypto');

/**
 * Generate a unique order ID in the format XXXX-XXXX-XXXX
 * 12 random digits, grouped in 3 segments of 4
 *
 * @returns {string} e.g. '4637-8821-0473'
 */
function generate() {
  const bytes = crypto.randomBytes(6);
  const digits = Array.from(bytes)
    .map(b => (b % 100).toString().padStart(2, '0'))
    .join('');

  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
}

module.exports = { generate };
