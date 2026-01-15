/**
 * GET /user - Resolve user account info
 * Returns user limits, usage, and plan info for authenticated users
 */
module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Check admin if uid is provided (looking up another user)
  if (settings.uid && settings.uid !== user.auth.uid) {
    if (!user.roles.admin) {
      return assistant.respond('Admin required to look up other users', { code: 403 });
    }

    // Fetch the requested user
    const { admin } = Manager.libraries;
    const doc = await admin.firestore().doc(`users/${settings.uid}`).get();

    if (!doc.exists) {
      return assistant.respond('User not found', { code: 404 });
    }

    return assistant.respond({ user: doc.data() });
  }

  // Return current user info
  return assistant.respond({
    user: {
      auth: user.auth,
      plan: user.plan,
      roles: user.roles,
      usage: user.usage,
      limits: user.limits,
    },
  });
};
