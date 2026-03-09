const fetch = require('wonderful-fetch');

/**
 * Verify a Google reCAPTCHA token
 * @param {string} token - The reCAPTCHA response token
 * @param {object} [options] - Options
 * @param {number} [options.minScore=0.5] - Minimum score threshold (v3)
 * @returns {Promise<boolean>} Whether the token is valid
 */
async function verify(token, options) {
  const minScore = options?.minScore || 0.5;

  if (!process.env.RECAPTCHA_SECRET_KEY) {
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const data = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'post',
      response: 'json',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
    });

    return data.success && (data.score === undefined || data.score >= minScore);
  } catch (e) {
    console.error('reCAPTCHA verification error:', e);
    return false;
  }
}

module.exports = { verify };
