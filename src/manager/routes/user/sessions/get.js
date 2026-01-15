/**
 * GET /user/sessions - Get active sessions
 * Returns all active sessions for a user
 */
module.exports = async ({ assistant, user, settings, libraries }) => {
  const { admin } = libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Get target UID
  const uid = settings.uid;

  // Require admin to view other users' sessions
  if (uid !== user.auth.uid && !user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  const sessionId = settings.id;
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
