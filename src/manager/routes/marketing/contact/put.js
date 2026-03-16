/**
 * PUT /marketing/contact - Sync marketing contact by UID
 * Admin-only endpoint to re-sync a user's data to marketing providers
 */

module.exports = async ({ assistant, Manager, settings, analytics }) => {

  // Initialize Usage to check auth level
  const usage = await Manager.Usage().init(assistant, {
    unauthenticatedMode: 'firestore',
  });
  const isAdmin = usage.user.roles?.admin;

  // Admin only endpoint
  if (!isAdmin) {
    return assistant.respond('Admin access required', { code: 403 });
  }

  const uid = (settings.uid || '').trim();

  if (!uid) {
    return assistant.respond('UID is required', { code: 400 });
  }

  // Sync via email library (accepts UID string, resolves user doc internally)
  const mailer = Manager.Email(assistant);
  const result = await mailer.sync(uid);

  // Log result
  assistant.log('marketing/contact sync result:', { uid, providers: result });

  // Track analytics
  analytics.event('marketing/contact', { action: 'sync' });

  return assistant.respond({
    success: true,
    providers: result,
  });
};
