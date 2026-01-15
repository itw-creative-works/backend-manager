/**
 * POST /admin/cron - Run cron job manually
 * Admin-only endpoint to trigger cron jobs
 */
module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;

  // Require authentication (allow in dev)
  if (!user.authenticated && assistant.isProduction()) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin (allow in dev)
  if (!user.roles.admin && assistant.isProduction()) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  // Check for required parameter
  if (!settings.id) {
    return assistant.respond('Missing parameter {id}', { code: 400 });
  }

  assistant.log('Running cron job:', settings.id);

  // Run the cron job
  const result = await Manager._process(
    (new (require(`../../functions/core/cron/${settings.id}.js`))()).init(Manager, { context: {} })
  ).catch(e => e);

  if (result instanceof Error) {
    return assistant.respond(result.message, { code: 500 });
  }

  // Track analytics
  assistant.analytics.event('admin/cron', { id: settings.id });

  return assistant.respond(result);
};
