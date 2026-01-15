/**
 * GET /admin/database - Read Realtime Database
 * Admin-only endpoint to read any path
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

  // Require admin
  if (!user.roles.admin) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  // Require path
  if (!settings.path) {
    return assistant.respond('Path parameter required.', { code: 400 });
  }

  assistant.log('main(): Read', settings.path);

  // Read from Realtime Database
  const snapshot = await admin.database().ref(settings.path).once('value')
    .catch((e) => {
      return assistant.respond(e.message, { code: 500 });
    });

  // Return empty object if path doesn't exist (snapshot.val() returns null)
  return assistant.respond(snapshot.val() || {});
};
