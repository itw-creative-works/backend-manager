/**
 * POST /user/token - Create custom Firebase token
 * Creates a custom auth token for the authenticated user
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

  // Require admin to create tokens for other users
  if (uid !== user.auth.uid && !user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

  // Create custom token
  const token = await admin.auth().createCustomToken(uid)
    .catch((e) => {
      return assistant.respond(`Failed to create custom token: ${e}`, { code: 500 });
    });

  return assistant.respond({ token });
};
