const fetch = require('wonderful-fetch');

// NeverBounce numeric → textcode map. The v4 single/check API returns `result`
// as a textcode STRING ('valid', 'invalid', ...); numeric codes only appear in
// other response modes — tolerate both so a representation change can't silently
// fail every check again (that exact bug skipped marketing sync for all signups
// between BEM 5.5.1 and 5.6.1).
const NUMERIC_RESULT_MAP = {
  0: 'valid',
  1: 'invalid',
  2: 'disposable',
  3: 'catchall',
  4: 'unknown',
};

// valid, catchall, unknown are allowed; invalid, disposable are blocked
const ALLOWED_RESULTS = new Set(['valid', 'catchall', 'unknown']);

/**
 * Normalize a NeverBounce single-check `result` into { valid, status }.
 * Accepts textcode strings (canonical) or numeric codes; 'catch-all' → 'catchall'.
 *
 * @param {string|number} result - NeverBounce `result` field
 * @returns {{ valid: boolean, status: string }}
 */
function parseResult(result) {
  const status = typeof result === 'number'
    ? (NUMERIC_RESULT_MAP[result] || 'unknown')
    : String(result).toLowerCase().replace('-', '');

  return { valid: ALLOWED_RESULTS.has(status), status };
}

/**
 * @param {string} email
 * @returns {Promise<{ valid: boolean, status?: string, subStatus?: string, error?: string, provider: string }>}
 */
async function verify(email) {
  try {
    const data = await fetch(
      `https://api.neverbounce.com/v4.2/single/check?key=${process.env.NEVERBOUNCE_API_KEY}&email=${encodeURIComponent(email)}`,
      { response: 'json', timeout: 60000 },
    );

    if (data.status !== 'success') {
      console.error('NeverBounce API error:', data.message || data.status);
      return { valid: true, error: data.message || `Unexpected status: ${data.status}`, provider: 'neverbounce' };
    }

    if (data.result == null) {
      console.error('NeverBounce unexpected response:', data);
      return { valid: true, error: 'Unexpected response format', provider: 'neverbounce' };
    }

    const { valid, status } = parseResult(data.result);

    return {
      valid,
      status,
      subStatus: data.flags?.length ? data.flags.join(',') : null,
      provider: 'neverbounce',
    };
  } catch (e) {
    console.error('NeverBounce validation error:', e);
    return { valid: true, error: e.message, provider: 'neverbounce' };
  }
}

module.exports = { verify, parseResult };
