const fetch = require('wonderful-fetch');

/**
 * @param {string} email
 * @returns {Promise<{ valid: boolean, status?: string, subStatus?: string, error?: string, provider: string }>}
 */
async function verify(email) {
  try {
    const data = await fetch(
      `https://api.zerobounce.net/v2/validate?api_key=${process.env.ZEROBOUNCE_API_KEY}&email=${encodeURIComponent(email)}`,
      { response: 'json', timeout: 60000 },
    );

    if (data.error) {
      console.error('ZeroBounce API error:', data.error);
      return { valid: true, error: data.error, provider: 'zerobounce' };
    }

    if (!data.status) {
      console.error('ZeroBounce unexpected response:', data);
      return { valid: true, error: 'Unexpected response format', provider: 'zerobounce' };
    }

    // 'valid', 'catch-all', 'unknown' are allowed; everything else is blocked
    const zbValid = data.status === 'valid'
      || data.status === 'catch-all'
      || data.status === 'unknown';

    return {
      valid: zbValid,
      status: data.status,
      subStatus: data.sub_status || null,
      provider: 'zerobounce',
    };
  } catch (e) {
    console.error('ZeroBounce validation error:', e);
    return { valid: true, error: e.message, provider: 'zerobounce' };
  }
}

module.exports = { verify };
