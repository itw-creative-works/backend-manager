const fetch = require('wonderful-fetch');

module.exports = {
  provider: 'spotify',
  name: 'Spotify',
  urls: {
    authorize: 'https://accounts.spotify.com/authorize',
    tokenize: 'https://accounts.spotify.com/api/token',
    refresh: 'https://accounts.spotify.com/api/token',
    revoke: '',
    status: '',
    removeAccess: 'https://www.spotify.com/account/apps/',
  },
  scope: ['user-read-email', 'user-read-private'],

  // Spotify doesn't need special auth params
  authParams: {},

  // Spotify does not support token revocation
  async revokeToken(token, context) {
    const { assistant } = context;

    assistant.log('Spotify does not support token revocation');

    return { revoked: false, reason: 'Spotify does not support token revocation' };
  },

  async verifyIdentity(tokenizeResult, Manager, assistant) {
    assistant.log('verifyIdentity(): tokenizeResult', tokenizeResult);

    // Get identity from Spotify API
    const identityResponse = await fetch('https://api.spotify.com/v1/me', {
      timeout: 60000,
      response: 'json',
      tries: 1,
      log: true,
      cacheBreaker: false,
      headers: {
        authorization: `${tokenizeResult.token_type} ${tokenizeResult.access_token}`,
      },
    });

    assistant.log('verifyIdentity(): identityResponse', identityResponse);

    // Check if exists
    const snap = await Manager.libraries.admin.firestore().collection('users')
      .where('oauth2.spotify.identity.id', '==', identityResponse.id)
      .get();

    if (snap.size > 0) {
      throw new Error(`This Spotify account is already connected to a ${Manager.config.brand.name} account`);
    }

    return identityResponse;
  },
};
