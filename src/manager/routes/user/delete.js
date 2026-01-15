const fetch = require('wonderful-fetch');

/**
 * DELETE /user - Delete user account
 * Requires admin auth or self-deletion with admin override
 */
module.exports = async ({ assistant, Manager, user, settings, libraries }) => {
  const { admin } = libraries;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Get target UID
  const uid = settings.uid;

  // Require admin to delete other users
  if (uid !== user.auth.uid && !user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  // Fetch user to check subscription status
  const userDoc = await admin.firestore().doc(`users/${uid}`).get();

  if (!userDoc.exists) {
    return assistant.respond('User not found', { code: 404 });
  }

  const userData = userDoc.data();

  // Disallow deleting users with active subscriptions
  if (
    (userData?.plan?.status && userData?.plan?.status !== 'cancelled')
    || userData?.plan?.payment?.active
  ) {
    return assistant.respond(
      'This account cannot be deleted because it has a paid subscription attached to it. In order to delete the account, you must first cancel the paid subscription.',
      { code: 400 }
    );
  }

  // Sign out of all sessions first
  assistant.log(`Signing out of all sessions for ${uid}...`);

  await fetch(`${Manager.project.apiUrl}/backend-manager/user/sessions`, {
    method: 'delete',
    timeout: 30000,
    response: 'json',
    tries: 2,
    log: true,
    headers: {
      'Authorization': `Bearer ${process.env.BACKEND_MANAGER_KEY}`,
    },
    body: { uid },
  })
    .then((json) => {
      assistant.log(`Sign out of all sessions success`, json);
    })
    .catch((e) => {
      assistant.error(`Sign out of all sessions failed`, e);
    });

  // Delete the user
  await admin.auth().deleteUser(uid)
    .catch((e) => {
      return assistant.respond(`Failed to delete user: ${e}`, { code: 500 });
    });

  return assistant.respond({ success: true });
};
