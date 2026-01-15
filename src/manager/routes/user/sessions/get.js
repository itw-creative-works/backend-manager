/**
 * GET /user/sessions - Get active sessions
 * Returns all active sessions for a user
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

  // Require admin to view other users' sessions
  if (uid !== user.auth.uid && !user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  const sessionId = settings.id || 'app';
  const sessionPath = `sessions/${sessionId}`;

  assistant.log(`Getting active sessions for ${uid} @ ${sessionPath}`);

  // Query sessions
  const snapshot = await admin.database().ref(sessionPath)
    .orderByChild('uid')
    .equalTo(uid)
    .once('value')
    .catch((e) => {
      return assistant.respond(`Session query error: ${e}`, { code: 500 });
    });

  const data = snapshot.val() || {};

  return assistant.respond(data);
};
