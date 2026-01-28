const fetch = require('wonderful-fetch');

module.exports = {
  provider: 'discord',
  name: 'Discord',
  urls: {
    authorize: 'https://discord.com/api/oauth2/authorize',
    tokenize: 'https://discord.com/api/oauth2/token',
    refresh: 'https://discord.com/api/oauth2/token',
    status: '',
    removeAccess: 'https://discord.com/channels/@me',
  },
  scope: ['identify', 'email'],

  buildUrl(state, url, assistant) {
    // Additional URL building if needed for authorize state
    return url;
  },

  async verifyIdentity(tokenizeResult, Manager, assistant) {
    assistant.log('verifyIdentity(): tokenizeResult', tokenizeResult);

    // Get identity from Discord API
    const identityResponse = await fetch('https://discord.com/api/users/@me', {
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
      .where('oauth2.discord.identity.id', '==', identityResponse.id)
      .get();

    if (snap.size > 0) {
      throw new Error(`This Discord account is already connected to a ${Manager.config.brand.name} account`);
    }

    return identityResponse;
  },
};
