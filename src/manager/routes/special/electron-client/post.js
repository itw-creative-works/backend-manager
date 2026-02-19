/**
 * POST /special/electron-client - Setup Electron Manager client
 * Returns client configuration with optional auth
 */
const path = require('path');
const { buildPublicConfig } = require(path.join(__dirname, '..', '..', 'app', 'get.js'));

module.exports = async ({ assistant, Manager, settings, analytics, libraries }) => {
  const { admin } = libraries;

  // appId/app fallback to Manager.config
  let uid = settings.uid;
  let config = settings.config;

  let uuid = null;
  let signInToken = null;

  // If authenticated, get user and create custom token
  const user = assistant.getUser();
  if (user.authenticated && user.roles?.admin) {
    uid = user.auth?.uid ?? null;

    if (uid) {
      try {
        signInToken = await admin.auth().createCustomToken(uid);
      } catch (e) {
        return assistant.respond(`Failed to create custom token: ${e}`, { code: 500 });
      }
    }
  }

  // Generate UUID if uid is available
  if (uid) {
    const uuidLib = Manager.require('uuid');
    const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    uuid = uuidLib.v5(uid, NAMESPACE);
  }

  // Validate config
  if (config.backendManagerKey === process.env.BACKEND_MANAGER_KEY && process.env.BACKEND_MANAGER_KEY) {
    assistant.log('Validated config', config);
  } else {
    config = {};
  }

  // Track analytics
  analytics.event('special/electron-client', { action: 'setup' });

  return assistant.respond({
    uuid: uuid,
    signInToken: signInToken,
    timestamp: new Date().toISOString(),
    ip: assistant.request.geolocation.ip,
    country: assistant.request.geolocation.country,
    app: buildPublicConfig(Manager.config),
    config: config,
  });
};
