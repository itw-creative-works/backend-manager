/**
 * POST /admin/infer-contact - Infer contact info from email addresses
 * Admin-only endpoint for testing/debugging the inferContact pipeline
 */
const { inferContact } = require('../../../libraries/infer-contact.js');

module.exports = async ({ assistant, user, settings }) => {

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin
  if (!user.roles.admin) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  // Accept single email or array of emails. Schema defaults `emails` to [], so check length:
  // an empty default should NOT shadow a provided single `email`.
  const emails = Array.isArray(settings.emails) && settings.emails.length > 0
    ? settings.emails
    : [settings.email];

  const results = await Promise.all(
    emails
      .filter(Boolean)
      .map(async (email) => {
        const result = await inferContact(email, assistant);
        return { email, ...result };
      })
  );

  return assistant.respond({ results });
};
