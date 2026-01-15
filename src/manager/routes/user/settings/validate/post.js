const _ = require('lodash');
const jetpack = require('fs-jetpack');
const powertools = require('node-powertools');
const path = require('path');

/**
 * POST /user/settings/validate - Validate user settings against defaults
 * Merges user settings with plan-specific defaults from defaults.js
 */
module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;
  const { admin } = Manager.libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Get target UID (default to self)
  const uid = settings.uid || user.auth.uid;

  // Require admin to validate other users' settings
  if (uid !== user.auth.uid && !user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  // Get user data for plan
  let userData = user;

  if (uid !== user.auth.uid) {
    const doc = await admin.firestore().doc(`users/${uid}`).get();

    if (!doc.exists) {
      return assistant.respond('User not found', { code: 404 });
    }

    userData = doc.data();
  }

  // Merge existing and new settings
  const mergedSettings = _.merge({}, settings.existingSettings, settings.newSettings);

  // Resolve defaults path
  const resolvedPath = path.join(Manager.cwd, 'defaults.js');

  // Check if file exists
  if (!jetpack.exists(resolvedPath)) {
    return assistant.respond(`Defaults file at ${resolvedPath} does not exist, please add it manually.`, { code: 500, sentry: true });
  }

  // Load and process defaults
  try {
    const defaults = _.get(require(resolvedPath)(), settings.defaultsPath);
    const combined = combineDefaults(defaults.all, defaults[userData.plan?.id] || {});

    assistant.log('Combined settings', combined);

    return assistant.respond(powertools.defaults(mergedSettings, combined));
  } catch (e) {
    return assistant.respond(`Unable to load file at ${resolvedPath}: ${e}`, { code: 500, sentry: true });
  }
};

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function combineDefaults(base, override) {
  const done = [];

  powertools.getKeys(override)
    .forEach((keyPath) => {
      const pathMinusLast = keyPath.split('.').slice(0, -1).join('.');
      const valueAtPath = _.get(override, keyPath);
      const valueAtParent = _.get(override, pathMinusLast);

      if (done.includes(pathMinusLast) || isObject(valueAtPath)) {
        return;
      }

      _.set(base, pathMinusLast, valueAtParent);
      done.push(pathMinusLast);
    });

  return base;
}
