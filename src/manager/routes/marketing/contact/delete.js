/**
 * DELETE /marketing/contact - Remove marketing contact
 * Admin-only endpoint to unsubscribe from newsletter
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

  // Extract parameters
  const email = (settings.email || '').trim().toLowerCase();
  const providers = settings.providers;

  // Validate email is provided
  if (!email) {
    return assistant.respond('Email is required', { code: 400 });
  }

  // Remove from providers
  const mailer = Manager.Email(assistant);
  const providerResults = await mailer.remove(email, { providers });

  // Log result
  assistant.log('marketing/contact delete result:', {
    email,
    providers: providerResults,
  });

  // Track analytics
  analytics.event('marketing/contact', { action: 'delete' });

  return assistant.respond({
    success: true,
    providers: providerResults,
  });
};
