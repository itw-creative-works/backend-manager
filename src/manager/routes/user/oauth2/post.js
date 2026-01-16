const _ = require('lodash');
const fetch = require('wonderful-fetch');
const { arrayify } = require('node-powertools');

/**
 * POST /user/oauth2 - OAuth2 operations
 *
 * States:
 *   - authorize: Get authorization URL
 *   - tokenize: Exchange code for tokens
 *   - refresh: Refresh access token
 *   - deauthorize: Remove OAuth2 connection
 *   - status: Check connection status
 */
module.exports = async ({ assistant, Manager, user, settings, libraries }) => {
  const { admin } = libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin to manage other users' OAuth
  const uid = settings.uid;

  if (uid !== user.auth.uid && !user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  // Get target user data
  let userData = user;

  if (uid !== user.auth.uid) {
    const doc = await admin.firestore().doc(`users/${uid}`).get();

    if (!doc.exists) {
      return assistant.respond('User not found', { code: 404 });
    }

    userData = doc.data();
  }

  // Validate provider
  if (!settings.provider) {
    return assistant.respond('The provider parameter is required.', { code: 400 });
  }

  // Load provider module
  let oauth2;

  try {
    oauth2 = require(`./providers/${settings.provider}.js`);
  } catch (e) {
    return assistant.respond(`Unknown OAuth2 provider: ${settings.provider}`, { code: 400 });
  }

  // Build OAuth2 URL for current state
  const ultimateJekyllOAuth2Url = assistant.isDevelopment()
    ? 'https://localhost:4000/oauth2'
    : `${Manager.config.brand.url}/oauth2`;

  // Get OAuth2 credentials from environment variables
  // Format: OAUTH2_{PROVIDER}_CLIENT_ID, OAUTH2_{PROVIDER}_CLIENT_SECRET
  const providerEnvKey = settings.provider.toUpperCase().replace(/-/g, '_');
  const client_id = process.env[`OAUTH2_${providerEnvKey}_CLIENT_ID`];
  const client_secret = process.env[`OAUTH2_${providerEnvKey}_CLIENT_SECRET`];

  const state = settings.state;

  assistant.log('OAuth2 settings', settings);

  // Process by state
  switch (state) {
    case 'authorize':
      return processAuthorize(assistant, Manager, settings, oauth2, ultimateJekyllOAuth2Url, client_id);

    case 'tokenize':
      return processTokenize(assistant, Manager, admin, settings, oauth2, ultimateJekyllOAuth2Url, client_id, client_secret, uid);

    case 'refresh':
      return processRefresh(assistant, Manager, admin, settings, oauth2, client_id, client_secret, uid, userData);

    case 'deauthorize':
      return processDeauthorize(assistant, Manager, admin, settings, uid);

    case 'status':
      return processStatus(assistant, Manager, admin, settings, oauth2, uid, userData);

    default:
      return assistant.respond(`Unknown OAuth2 state: ${state}`, { code: 400 });
  }
};

async function processAuthorize(assistant, Manager, settings, oauth2, ultimateJekyllOAuth2Url, client_id) {
  if (!client_id) {
    return assistant.respond(`Missing client_id for ${settings.provider} provider`, { code: 500 });
  }

  // Build state data - some defaults require runtime context so we keep fallbacks here
  const defaultReferrer = assistant.isDevelopment() ? 'https://localhost:4000/account' : `${Manager.config.brand.url}/account`;
  const stateData = {
    code: 'success',
    provider: settings.provider,
    authenticationToken: settings.authenticationToken,
    serverUrl: settings.serverUrl || `${Manager.project.apiUrl}/backend-manager`,
    referrer: settings.referrer || defaultReferrer,
    redirectUrl: settings.redirect_uri || settings.referrer || defaultReferrer,
  };

  const url = new URL(oauth2.urls.authorize);
  url.searchParams.set('state', JSON.stringify(stateData));
  url.searchParams.set('client_id', client_id);
  url.searchParams.set('scope', arrayify(settings.scope).join(' '));
  url.searchParams.set('redirect_uri', ultimateJekyllOAuth2Url);
  url.searchParams.set('access_type', settings.access_type);
  url.searchParams.set('prompt', settings.prompt);
  url.searchParams.set('include_granted_scopes', settings.include_granted_scopes);
  url.searchParams.set('response_type', settings.response_type);

  // Allow provider to modify URL
  const finalUrl = oauth2.buildUrl('authorize', url, assistant);
  const urlString = (finalUrl || url).toString();

  assistant.log('OAuth2 authorize URL', urlString);

  if (settings.redirect) {
    return assistant.redirect(urlString);
  }

  return assistant.respond({ url: urlString });
}

async function processTokenize(assistant, Manager, admin, settings, oauth2, ultimateJekyllOAuth2Url, client_id, client_secret, uid) {
  assistant.log('Running processTokenize()');

  const body = {
    client_id,
    client_secret,
    grant_type: 'authorization_code',
    redirect_uri: ultimateJekyllOAuth2Url,
    code: settings.code,
  };

  assistant.log('tokenize body', body);

  const tokenizeResponse = await fetch(oauth2.urls.tokenize, {
    method: 'POST',
    timeout: 60000,
    response: 'json',
    tries: 1,
    log: true,
    body: new URLSearchParams(body),
    cacheBreaker: false,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  }).catch((e) => e);

  assistant.log('tokenizeResponse', tokenizeResponse);

  if (tokenizeResponse instanceof Error) {
    return assistant.respond(tokenizeResponse.message, { code: 500 });
  }

  // Verify identity
  const verifiedIdentity = await oauth2.verifyIdentity(tokenizeResponse, Manager, assistant)
    .catch((e) => e);

  assistant.log('verifiedIdentity', verifiedIdentity);

  if (verifiedIdentity instanceof Error) {
    return assistant.respond(verifiedIdentity.message, { code: 400 });
  }

  if (tokenizeResponse && !tokenizeResponse.refresh_token) {
    return assistant.respond(
      `Missing "refresh_token" in response. Visit ${oauth2.urls.removeAccess} and remove our app from your account and then try again.`,
      { code: 400 }
    );
  }

  // Store tokens
  await admin.firestore().doc(`users/${uid}`)
    .set({
      oauth2: {
        [settings.provider]: {
          code: _.omit(settings, ['redirect', 'referrer', 'provider', 'state']),
          token: tokenizeResponse,
          identity: verifiedIdentity,
          updated: {
            timestamp: assistant.meta.startTime.timestamp,
            timestampUNIX: assistant.meta.startTime.timestampUNIX,
          },
        },
      },
      metadata: Manager.Metadata().set({ tag: 'user/oauth2' }),
    }, { merge: true })
    .catch((e) => {
      return assistant.respond(`Failed to store tokens: ${e.message}`, { code: 500 });
    });

  return assistant.respond({ success: true });
}

async function processRefresh(assistant, Manager, admin, settings, oauth2, client_id, client_secret, uid, userData) {
  assistant.log('Running processRefresh()');

  const refresh_token = _.get(userData, `oauth2.${settings.provider}.token.refresh_token`);

  if (!refresh_token) {
    return assistant.respond('No refresh token found', { code: 400 });
  }

  const body = {
    client_id,
    client_secret,
    grant_type: 'refresh_token',
    refresh_token,
  };

  assistant.log('refresh body', body);

  const refreshResponse = await fetch(oauth2.urls.refresh, {
    method: 'POST',
    timeout: 60000,
    response: 'json',
    tries: 1,
    log: true,
    body: new URLSearchParams(body),
    cacheBreaker: false,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  }).catch((e) => e);

  assistant.log('refreshResponse', refreshResponse);

  if (refreshResponse instanceof Error) {
    return assistant.respond(refreshResponse.message, { code: 500 });
  }

  // Store refreshed tokens
  await admin.firestore().doc(`users/${uid}`)
    .set({
      oauth2: {
        [settings.provider]: {
          token: refreshResponse,
          updated: {
            timestamp: assistant.meta.startTime.timestamp,
            timestampUNIX: assistant.meta.startTime.timestampUNIX,
          },
        },
      },
      metadata: Manager.Metadata().set({ tag: 'user/oauth2' }),
    }, { merge: true })
    .catch((e) => {
      return assistant.respond(`Failed to store tokens: ${e.message}`, { code: 500 });
    });

  return assistant.respond({ success: true });
}

async function processDeauthorize(assistant, Manager, admin, settings, uid) {
  await admin.firestore().doc(`users/${uid}`)
    .set({
      oauth2: {
        [settings.provider]: {},
        updated: {
          timestamp: assistant.meta.startTime.timestamp,
          timestampUNIX: assistant.meta.startTime.timestampUNIX,
        },
      },
      metadata: Manager.Metadata().set({ tag: 'user/oauth2' }),
    }, { merge: true })
    .catch((e) => {
      return assistant.respond(`Failed to deauthorize: ${e.message}`, { code: 500 });
    });

  return assistant.respond({ success: true });
}

async function processStatus(assistant, Manager, admin, settings, oauth2, uid, userData) {
  const removeInvalidTokens = settings.removeInvalidTokens;

  const token = _.get(userData, `oauth2.${settings.provider}.token.refresh_token`, '');

  if (!token) {
    return assistant.respond({ status: 'disconnected' });
  }

  // If provider has verifyConnection, use it
  if (oauth2.verifyConnection) {
    const status = await oauth2.verifyConnection(token, Manager, assistant)
      .catch(async (e) => {
        if (removeInvalidTokens) {
          await removeOAuth2Token(admin, settings.provider, uid, assistant, Manager);
        }
        return 'error';
      });

    if (status === 'disconnected' && removeInvalidTokens) {
      await removeOAuth2Token(admin, settings.provider, uid, assistant, Manager);
    }

    return assistant.respond({ status });
  }

  // Default to connected if we have a token
  return assistant.respond({ status: 'connected' });
}

async function removeOAuth2Token(admin, provider, uid, assistant, Manager) {
  await admin.firestore().doc(`users/${uid}`)
    .set({
      oauth2: {
        [provider]: {},
        updated: {
          timestamp: assistant.meta.startTime.timestamp,
          timestampUNIX: assistant.meta.startTime.timestampUNIX,
        },
      },
      metadata: Manager.Metadata().set({ tag: 'user/oauth2' }),
    }, { merge: true });

  assistant.log(`Removed disconnected token for user: ${uid}`);
}
