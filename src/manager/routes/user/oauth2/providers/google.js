const fetch = require('wonderful-fetch');
const { jwtDecode } = require('jwt-decode');

module.exports = {
  provider: 'google',
  name: 'Google',
  urls: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenize: 'https://oauth2.googleapis.com/token',
    refresh: 'https://oauth2.googleapis.com/token',
    revoke: 'https://oauth2.googleapis.com/revoke',
    status: 'https://oauth2.googleapis.com/tokeninfo',
    removeAccess: 'https://myaccount.google.com/security',
  },
  scope: ['openid', 'email', 'profile'],

  // Google-specific OAuth parameters
  authParams: {
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  },

  // Revoke a token with Google
  async revokeToken(token, context) {
    const { assistant } = context;

    const response = await fetch(this.urls.revoke, {
      method: 'POST',
      timeout: 30000,
      body: new URLSearchParams({ token }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(e => e);

    if (response instanceof Error) {
      assistant.log('Google revokeToken error:', response.message);
      return { revoked: false, reason: response.message };
    }

    return { revoked: true };
  },

  async verifyIdentity(tokenizeResult, Manager, assistant) {
    assistant.log('verifyIdentity(): tokenizeResult', tokenizeResult);

    // Decode token
    const decoded = jwtDecode(tokenizeResult.id_token);
    assistant.log('verifyIdentity(): decoded', decoded);

    // Require email scope for proper identity verification
    if (!decoded.email) {
      throw new Error('Email scope is required. Please ensure "email" scope is included in the OAuth request.');
    }

    // Check if exists
    const snap = await Manager.libraries.admin.firestore().collection('users')
      .where('oauth2.google.identity.email', '==', decoded.email)
      .get();

    if (snap.size > 0) {
      throw new Error(`This Google account is already connected to a ${Manager.config.brand.name} account`);
    }

    return decoded;
  },
};
