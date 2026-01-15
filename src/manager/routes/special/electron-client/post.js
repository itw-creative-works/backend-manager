/**
 * POST /special/electron-client - Setup Electron Manager client
 * Returns client configuration with optional auth
 */
module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const settings = assistant.settings;
  const fetch = Manager.require('wonderful-fetch');
  const { admin } = Manager.libraries;

  let uid = settings.uid;
  const app = settings.appId || settings.app || Manager.config.app.id;
  let config = settings.config || {};

  let uuid = null;
  let signInToken = null;

  // If authenticated, get user and create custom token
  const user = assistant.usage.user;
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

  // Fetch app details
  const appDetails = await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/getApp', {
    method: 'post',
    timeout: 30000,
    tries: 3,
    response: 'json',
    body: {
      id: app,
    },
  }).catch(e => e);

  if (appDetails instanceof Error) {
    return assistant.respond(`Error fetching app details: ${appDetails}`, { code: 500 });
  }

  // Track analytics
  assistant.analytics.event('special/electron-client', { action: 'setup' });

  return assistant.respond({
    uuid: uuid,
    signInToken: signInToken,
    timestamp: new Date().toISOString(),
    ip: assistant.request.geolocation.ip,
    country: assistant.request.geolocation.country,
    app: appDetails,
    config: config,
  });
};
