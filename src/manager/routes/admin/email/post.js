/**
 * POST /admin/email - Send email via SendGrid
 *
 * Admin-only endpoint to send transactional emails.
 * Supports flexible recipient formats (string, object, UID, or arrays of mixed).
 *
 * See: src/manager/libraries/email/ for the shared email builder and sender.
 */
module.exports = async ({ assistant, user, settings }) => {
  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin
  if (!user.roles.admin) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  // Check for SendGrid key
  if (!process.env.SENDGRID_API_KEY) {
    return assistant.respond('SendGrid API key not configured.', { code: 500 });
  }

  assistant.log('Request:', settings);

  const email = assistant.Manager.Email(assistant);
  const result = await email.send(settings).catch(e => e);

  if (result instanceof Error) {
    return assistant.respond(result.message, { code: result.code || 500, sentry: result.code !== 400 });
  }

  return assistant.respond(result);
};
