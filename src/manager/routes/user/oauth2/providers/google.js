const fetch = require('wonderful-fetch');
const { jwtDecode } = require('jwt-decode');

module.exports = {
  provider: 'google',
  name: 'Google',
  urls: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenize: 'https://oauth2.googleapis.com/token',
    refresh: 'https://oauth2.googleapis.com/token',
    status: 'https://oauth2.googleapis.com/tokeninfo',
    removeAccess: 'https://myaccount.google.com/security',
  },
  scope: ['openid', 'email', 'profile'],

  buildUrl(state, url, assistant) {
    // Additional URL building if needed for authorize state
    return url;
  },

  async verifyIdentity(tokenizeResult, Manager, assistant) {
    assistant.log('verifyIdentity(): tokenizeResult', tokenizeResult);

    // Decode token
    const decoded = jwtDecode(tokenizeResult.id_token);
    assistant.log('verifyIdentity(): decoded', decoded);

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
