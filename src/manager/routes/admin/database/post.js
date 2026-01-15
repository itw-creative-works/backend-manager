/**
 * POST /admin/database - Write Realtime Database
 * Admin-only endpoint to write any path
 */
module.exports = async ({ assistant, user, settings, libraries }) => {
  const { admin } = libraries;

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

  assistant.log('main(): Write', settings.path, settings.document);

  // Write to Realtime Database
  await admin.database().ref(settings.path).set(settings.document)
    .catch((e) => {
      return assistant.respond(e.message, { code: 500 });
    });

  return assistant.respond(settings.document);
};
