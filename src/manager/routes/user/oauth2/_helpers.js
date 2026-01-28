const crypto = require('crypto');
const fetch = require('wonderful-fetch');
const { arrayify } = require('node-powertools');

// Constants
const STATE_TTL_MINUTES = 10;

// Derive OAuth state encryption key from BACKEND_MANAGER_KEY
const STATE_KEY = process.env.BACKEND_MANAGER_KEY
  ? crypto.createHash('sha256').update(`oauth2-state:${process.env.BACKEND_MANAGER_KEY}`).digest('hex')
  : null;

/**
 * Build context object with common OAuth2 data
 * Used by GET, POST, DELETE handlers
 */
async function buildContext({ assistant, Manager, user, settings, libraries, requireProvider = true }) {
  const { admin } = libraries;

  // Require authentication
  if (!user.authenticated) {
    return { error: { message: 'Authentication required', code: 401 } };
  }

  // Get target user (admin can manage other users)
  const targetUid = settings.uid || user.auth.uid;

  if (targetUid !== user.auth.uid && !user.roles.admin) {
    return { error: { message: 'Admin required to manage other users', code: 403 } };
  }

  // Resolve target user data
  let targetUser = user;

  if (targetUid !== user.auth.uid) {
    const doc = await admin.firestore().doc(`users/${targetUid}`).get();

    if (!doc.exists) {
      return { error: { message: 'User not found', code: 404 } };
    }

    targetUser = doc.data();
  }

  // Build redirect URI
  const redirectUri = assistant.isDevelopment()
    ? 'https://localhost:4000/oauth2'
    : `${Manager.config.brand.url}/oauth2`;

  // If provider not required (e.g., tokenize gets it from encrypted state), skip loading
  if (!requireProvider) {
    return {
      assistant,
      Manager,
      admin,
      settings,
      targetUid,
      targetUser,
      redirectUri,
    };
  }

  // Provider is required
  if (!settings.provider) {
    return { error: { message: 'The provider parameter is required', code: 400 } };
  }

  // Load provider module
  let oauth2Provider;

  try {
    oauth2Provider = require(`./providers/${settings.provider}.js`);
  } catch (e) {
    return { error: { message: `Unknown OAuth2 provider: ${settings.provider}`, code: 400 } };
  }

  // Get OAuth2 credentials
  const providerEnvKey = settings.provider.toUpperCase().replace(/-/g, '_');
  const clientId = process.env[`OAUTH2_${providerEnvKey}_CLIENT_ID`];
  const clientSecret = process.env[`OAUTH2_${providerEnvKey}_CLIENT_SECRET`];

  return {
    assistant,
    Manager,
    admin,
    oauth2Provider,
    settings,
    targetUid,
    targetUser,
    clientId,
    clientSecret,
    redirectUri,
  };
}

/**
 * Load provider and credentials from provider name
 */
function loadProvider(providerName) {
  let oauth2Provider;

  try {
    oauth2Provider = require(`./providers/${providerName}.js`);
  } catch (e) {
    return { error: { message: `Unknown OAuth2 provider: ${providerName}`, code: 400 } };
  }

  const providerEnvKey = providerName.toUpperCase().replace(/-/g, '_');
  const clientId = process.env[`OAUTH2_${providerEnvKey}_CLIENT_ID`];
  const clientSecret = process.env[`OAUTH2_${providerEnvKey}_CLIENT_SECRET`];

  return { oauth2Provider, clientId, clientSecret };
}

// ============================================================================
// Crypto Helpers
// ============================================================================

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function encryptState(data) {
  if (!STATE_KEY) {
    throw new Error('BACKEND_MANAGER_KEY not configured');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(STATE_KEY, 'hex'), iv);

  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag().toString('base64');

  return `${iv.toString('base64')}.${encrypted}.${authTag}`;
}

function decryptState(encryptedState) {
  if (!STATE_KEY) {
    throw new Error('BACKEND_MANAGER_KEY not configured');
  }

  const parts = encryptedState.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid state format');
  }

  const [ivB64, encryptedB64, authTagB64] = parts;

  const iv = Buffer.from(ivB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(STATE_KEY, 'hex'), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

module.exports = {
  STATE_TTL_MINUTES,
  STATE_KEY,
  buildContext,
  loadProvider,
  generateCsrfToken,
  encryptState,
  decryptState,
  // Re-export utilities for handlers
  fetch,
  arrayify,
};
