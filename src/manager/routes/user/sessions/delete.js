const powertools = require('node-powertools');

/**
 * DELETE /user/sessions - Sign out of all sessions
 * Signs user out of all active sessions and revokes refresh tokens
 */
module.exports = async ({ assistant, user, settings, libraries }) => {
  const { admin } = libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Get target UID
  const uid = settings.uid;

  // Require admin to sign out other users
  if (uid !== user.auth.uid && !user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  const sessionId = settings.id;
  const sessionPath = `sessions/${sessionId}`;

  let count = 0;

  // Sign out of main session
  count += await signOutOfSession(admin, assistant, uid, sessionPath);

  // Legacy for somiibo and old electron-manager
  count += await signOutOfSession(admin, assistant, uid, 'gatherings/online');

  // Revoke Firebase refresh tokens
  await admin.auth().revokeRefreshTokens(uid)
    .catch((e) => {
      return assistant.respond(`Failed to sign out of all sessions: ${e}`, { code: 500 });
    });

  return assistant.respond({
    sessions: count,
    message: `Successfully signed ${uid} out of all sessions`,
  });
};

/**
 * Sign out of a specific session path
 */
async function signOutOfSession(admin, assistant, uid, sessionPath) {
  let count = 0;

  const snapshot = await admin.database().ref(sessionPath)
    .orderByChild('uid')
    .equalTo(uid)
    .once('value')
    .catch((e) => {
      assistant.error(`Session query error for session ${sessionPath}: ${e}`);
      return null;
    });

  if (!snapshot) {
    return 0;
  }

  const data = snapshot.val() || {};
  const keys = Object.keys(data);

  assistant.log(`Signing out of ${keys.length} active sessions for ${uid} @ ${sessionPath}`);

  const promises = keys.map(async (key) => {
    assistant.log(`Signing out ${sessionPath}/${key}...`);

    // Send signout command
    await admin.database().ref(`${sessionPath}/${key}/command`)
      .set('signout')
      .catch((e) => assistant.error(`Failed to signout of session ${key}`, e));

    // Delay so the client has time to react to the command
    await powertools.wait(5000);

    // Delete session
    await admin.database().ref(`${sessionPath}/${key}`)
      .remove()
      .catch((e) => assistant.error(`Failed to delete session ${key}`, e));

    assistant.log(`Signed out successfully: ${key}`);
    count++;
  });

  await Promise.all(promises);

  return count;
}
