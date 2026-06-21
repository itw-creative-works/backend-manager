/**
 * POST /admin/hook - Run a hook or cron job manually
 *
 * Resolves the hook from multiple locations:
 *   1. BEM internal crons (e.g. path="cron/daily/blog-auto-publisher")
 *   2. BEM internal functions/core hooks
 *   3. Consumer project root
 *   4. Consumer hooks/ directory
 *
 * Supports both calling conventions:
 *   - Function export: module.exports = async ({ Manager, assistant, ... }) => {}
 *   - Class export: module.exports = class { main(assistant) {} }
 */
module.exports = async ({ assistant, Manager, user, settings, analytics }) => {

  if (!user.authenticated && assistant.isProduction()) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  if (!user.roles.admin && assistant.isProduction()) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  if (!settings.path) {
    return assistant.respond('Missing required parameter: path', { code: 400 });
  }

  assistant.log('Running hook:', settings.path);

  const loaded = loadHook(assistant, settings.path);

  if (!loaded) {
    return assistant.respond(`Hook not found: ${settings.path}`, { code: 404 });
  }

  const hookName = settings.path.split('/').pop();
  assistant.setLogPrefix(`hook/${hookName}()`);

  try {
    let result;

    if (loaded.type === 'function') {
      result = await loaded.handler({
        Manager,
        assistant,
        context: {},
        libraries: Manager.libraries,
      });
    } else {
      const instance = loaded.handler;
      instance.Manager = Manager;
      instance.assistant = assistant;
      instance.context = null;
      instance.libraries = Manager.libraries;
      result = await instance.main(assistant);
    }

    analytics.event('admin/hook', { path: settings.path });

    return assistant.respond(result || { success: true });
  } catch (e) {
    assistant.error(`Hook error: ${e.message}`, e);
    return assistant.respond(e.message, { code: 500 });
  }
};

function loadHook(assistant, hookPath) {
  const Manager = assistant.Manager;
  const path = require('path');

  const searchPaths = [
    // BEM internal crons + events (e.g. "cron/daily/blog-auto-publisher")
    path.join(Manager.rootDirectory, 'events', hookPath),
    // BEM internal functions/core
    path.join(Manager.rootDirectory, '..', '..', 'functions', 'core', hookPath),
    // Consumer project root
    path.join(Manager.cwd, hookPath),
    // Consumer hooks/ directory
    path.join(Manager.cwd, 'hooks', hookPath),
  ];

  for (const searchPath of searchPaths) {
    const resolved = pathify(searchPath);
    assistant.log('Trying path:', resolved);

    try {
      const mod = require(resolved);

      if (typeof mod === 'function' && !mod.prototype?.main) {
        return { type: 'function', handler: mod };
      }

      return { type: 'class', handler: new mod() };
    } catch (e) {
      // Continue to next path
    }
  }

  return null;
}

function pathify(p) {
  return `${p.replace(/\.js$/, '')}.js`;
}
