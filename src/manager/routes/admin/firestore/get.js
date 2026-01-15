/**
 * GET /admin/firestore - Read Firestore document
 * Admin-only endpoint to read any document
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

  assistant.log('main(): Reading', settings.path);

  // Read from Firestore
  const doc = await admin.firestore().doc(settings.path).get()
    .catch((e) => {
      return assistant.respond(e.message, { code: 500 });
    });

  // Return empty object if document doesn't exist (doc.data() returns undefined)
  return assistant.respond(doc.data() || {});
};
