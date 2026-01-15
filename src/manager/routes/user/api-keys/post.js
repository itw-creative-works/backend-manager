const uuid4 = require('uuid').v4;
const UIDGenerator = require('uid-generator');
const powertools = require('node-powertools');
const uidgen = new UIDGenerator(256);

/**
 * POST /user/api-keys - Regenerate API keys
 * Regenerates clientId and/or privateKey for the user
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

  // Require admin to regenerate other users' keys
  if (uid !== user.auth.uid && !user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  // Determine which keys to regenerate
  const keys = powertools.arrayify(settings.keys || ['clientId', 'privateKey']);
  const newKeys = {};

  keys.forEach((key) => {
    if (key.match(/client/i)) {
      newKeys.clientId = uuid4();
    } else if (key.match(/private/i)) {
      newKeys.privateKey = uidgen.generateSync();
    }
  });

  // Update user document
  await admin.firestore().doc(`users/${uid}`)
    .set({
      api: newKeys,
      metadata: Manager.Metadata().set({ tag: 'user/api-keys' }),
    }, { merge: true })
    .catch((e) => {
      return assistant.respond(`Failed to generate keys: ${e}`, { code: 500, sentry: true });
    });

  return assistant.respond(newKeys);
};
