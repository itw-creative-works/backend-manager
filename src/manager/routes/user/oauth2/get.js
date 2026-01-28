const {
  buildContext,
  generateCsrfToken,
  encryptState,
} = require('./_helpers.js');

/**
 * GET /user/oauth2 - Read operations
 *
 * Actions:
 *   - authorize (default): Get authorization URL
 *   - status: Check connection status
 */
module.exports = async ({ assistant, Manager, user, settings, libraries }) => {
  const context = await buildContext({ assistant, Manager, user, settings, libraries });

  if (context.error) {
    return assistant.respond(context.error.message, { code: context.error.code });
  }

  const { admin, oauth2Provider, targetUid, targetUser, clientId, clientSecret, redirectUri } = context;

  assistant.log('OAuth2 GET request', { action: settings.action, provider: settings.provider });

  switch (settings.action) {
    case 'status':
      return processStatus(context);

    case 'authorize':
    default:
      return processAuthorize(context);
  }
};

// ============================================================================
// Handlers
// ============================================================================

async function processAuthorize(context) {
  const { assistant, Manager, admin, oauth2Provider, settings, targetUid, clientId, redirectUri } = context;

  if (!clientId) {
    return assistant.respond(`Missing client_id for ${settings.provider} provider`, { code: 500 });
  }

  // Generate CSRF token
  const csrfToken = generateCsrfToken();

  // Store CSRF token in user's usage document (auto-cleaned daily)
  await admin.firestore().doc(`usage/${targetUid}`).set({
    oauth2: {
      [settings.provider]: {
        csrf: csrfToken,
        createdAt: Date.now(),
      },
    },
  }, { merge: true });

  // Build minimal state (no unnecessary data)
  const stateData = {
    provider: settings.provider,
    uid: targetUid,
    csrf: csrfToken,
    ts: Date.now(),
  };

  // Encrypt state
  let encryptedState;

  try {
    encryptedState = encryptState(stateData);
  } catch (e) {
    return assistant.respond(e.message, { code: 500 });
  }

  // Build authorization URL
  const url = new URL(oauth2Provider.urls.authorize);
  url.searchParams.set('state', encryptedState);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');

  // Set scopes from app config, fall back to provider defaults
  const appScopes = Manager.config?.oauth2?.[settings.provider]?.scope || [];
  const finalScopes = appScopes.length > 0 ? appScopes : (oauth2Provider.scope || []);
  url.searchParams.set('scope', finalScopes.join(' '));

  // Add provider-specific auth params
  const authParams = oauth2Provider.authParams || {};

  for (const [key, value] of Object.entries(authParams)) {
    url.searchParams.set(key, value);
  }

  const urlString = url.toString();

  assistant.log('OAuth2 authorize URL generated');

  if (settings.redirect) {
    return assistant.redirect(urlString);
  }

  return assistant.respond({ url: urlString });
}

async function processStatus(context) {
  const { assistant, Manager, admin, oauth2Provider, settings, targetUid, targetUser, clientId, clientSecret } = context;

  const token = targetUser?.oauth2?.[settings.provider]?.token?.refresh_token;

  if (!token) {
    return assistant.respond({ status: 'disconnected' });
  }

  // Verify connection if provider supports it
  if (oauth2Provider.verifyConnection) {
    const status = await oauth2Provider.verifyConnection(token, { Manager, assistant, clientId, clientSecret })
      .catch(() => 'error');

    if ((status === 'disconnected' || status === 'error') && settings.removeInvalidTokens) {
      await admin.firestore().doc(`users/${targetUid}`).update({
        [`oauth2.${settings.provider}`]: admin.firestore.FieldValue.delete(),
        metadata: Manager.Metadata().set({ tag: 'user/oauth2' }),
      });
      assistant.log(`Removed invalid token for user: ${targetUid}`);
    }

    return assistant.respond({ status });
  }

  return assistant.respond({ status: 'connected' });
}
