const fetch = require('wonderful-fetch');

const RESULT_MAP = {
  0: 'valid',
  1: 'invalid',
  2: 'disposable',
  3: 'catch-all',
  4: 'unknown',
};

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

    const status = RESULT_MAP[data.result] || 'unknown';
    // 0=valid, 3=catch-all, 4=unknown are allowed; 1=invalid, 2=disposable are blocked
    const nbValid = data.result === 0
      || data.result === 3
      || data.result === 4;

    return {
      valid: nbValid,
      status,
      subStatus: data.flags?.length ? data.flags.join(',') : null,
      provider: 'neverbounce',
    };
  } catch (e) {
    console.error('NeverBounce validation error:', e);
    return { valid: true, error: e.message, provider: 'neverbounce' };
  }
}

module.exports = { verify };
