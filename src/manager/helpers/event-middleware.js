/**
 * EventMiddleware
 * Used to handle middleware for event triggers (auth, firestore, cron)
 *
 * Usage in consumer projects:
 *   exports.userOnCreate = functions
 *     .firestore.document('users/{uid}')
 *     .onCreate((snapshot, context) =>
 *       Manager.EventMiddleware({ snapshot, context }).run('users/on-create')
 *     );
 *
 * Handler location: functions/hooks/events/{name}.js
 */

function EventMiddleware(m, payload) {
  const self = this;

  self.Manager = m;
  self.payload = payload;
}

EventMiddleware.prototype.run = function (handlerName, options) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const assistant = Manager.Assistant();
    options = options || {};

    // Resolve handler path
    // If it's an absolute path, use it directly
    // Otherwise, look in the consumer's hooks/events/ directory
    let handlerPath;
    if (handlerName.startsWith('/')) {
      handlerPath = handlerName;
    } else {
      handlerPath = `${Manager.cwd}/events/${handlerName}.js`;
    }

    // Build context based on event type
    const context = {
      Manager,
      assistant,
      libraries: Manager.libraries,
      // Event-specific properties (some may be undefined depending on event type)
      user: payload.user,
      context: payload.context,
      change: payload.change,
      snapshot: payload.snapshot,
    };

    // Load handler
    let handler;
    try {
      handler = require(handlerPath);
    } catch (e) {
      assistant.error(`EventMiddleware: Failed to load handler @ ${handlerPath}:`, e);
      return reject(e);
    }

    // Execute with hooks support
    const name = assistant.meta.name;
    const hook = Manager.handlers && Manager.handlers[name];

    try {
      // Pre hook
      if (hook) {
        await hook(context, 'pre');
      }

      // Main execution
      const result = await handler(context);

      // Post hook
      if (hook) {
        await hook(context, 'post');
      }

      return resolve(result);
    } catch (e) {
      // Re-throw auth errors (like HttpsError) to block the action
      if (e.code || e.httpErrorCode) {
        return reject(e);
      }
      assistant.error(`EventMiddleware: Handler error:`, e);
      return reject(e);
    }
  });
};

module.exports = EventMiddleware;
