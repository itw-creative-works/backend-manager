const pushid = require('pushid');

/**
 * POST /admin/firestore - Write Firestore document
 * Admin-only endpoint to write any document
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

  // Process path placeholders
  let path = settings.path;

  if (path.includes('{pushId}')) {
    path = path.replace(/\{pushId\}/gi, pushid());
  } else if (path.includes('{nanoId}')) {
    path = path.replace(/\{nanoId\}/gi, Manager.Utilities().randomId());
  }

  // Prepare document
  const document = {
    ...settings.document,
    metadata: Manager.Metadata().set({ tag: settings.metadataTag }),
  };

  // Build options
  const options = {
    merge: settings.merge,
  };

  assistant.log('main(): Writing', path, document, options);

  // Write to Firestore
  await admin.firestore().doc(path).set(document, options)
    .catch((e) => {
      return assistant.respond(e.message, { code: 500 });
    });

  return assistant.respond({ path });
};
