/**
 * POST /admin/hook - Run hook manually
 * Admin-only endpoint to trigger hooks
 */
module.exports = async ({ assistant, Manager, user, settings, analytics }) => {

  // Require authentication (allow in dev)
  if (!user.authenticated && assistant.isProduction()) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin (allow in dev)
  if (!user.roles.admin && assistant.isProduction()) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  // Check for required parameter
  if (!settings.path) {
    return assistant.respond('Missing required parameter: path', { code: 400 });
  }

  assistant.log('Running hook:', settings.path);

  // Load the hook
  const hook = loadHook(Manager, assistant, settings.path);

  if (!hook) {
    return assistant.respond(`Hook not found: ${settings.path}`, { code: 404 });
  }

  // Run the hook
  try {
    // Set variables
    hook.Manager = Manager;
    hook.assistant = assistant;
    hook.context = null;
    hook.libraries = Manager.libraries;

    // Get hook name
    const hookName = settings.path.split('/').pop();

    // Set log prefix
    assistant.setLogPrefix(`cron/daily/${hookName}()`);

    // Run the hook
    const result = await hook.main(assistant);

    // Track analytics
    analytics.event('admin/hook', { path: settings.path });

    return assistant.respond(result);
  } catch (e) {
    return assistant.respond(e.message, { code: 500 });
  }
};

// Helper: Load hook from multiple paths
function loadHook(Manager, assistant, hookPath) {
  const paths = [
    `${Manager.rootDirectory}/functions/core/${hookPath}`,
    `${Manager.cwd}/${hookPath}`,
    `${Manager.cwd}/hooks/${hookPath}`,
  ];

  for (let i = 0; i < paths.length; i++) {
    const current = pathify(paths[i]);

    assistant.log('Trying path:', current);

    try {
      return (new (require(current))());
    } catch (e) {
      // Continue to next path
    }
  }

  return null;
}

// Helper: Normalize path
function pathify(path) {
  return `${path.replace('.js', '')}.js`;
}
