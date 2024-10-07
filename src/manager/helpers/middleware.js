/**
 * Middleware
 * Used to handle middleware for the assistant
 */

const path = require('path');
const powertools = require('node-powertools');
const { merge } = require('lodash');

function Middleware(m, req, res) {
  const self = this;

  self.Manager = m;
  self.req = req;
  self.res = res;
}

Middleware.prototype.run = function (libPath, options) {
  const self = this;

  // Set shortcuts
  const Manager = self.Manager;
  const req = self.req;
  const res = self.res;
  const { cors } = Manager.libraries;

  return cors(req, res, async () => {
    const assistant = Manager.Assistant({req: req, res: res});

    const data = assistant.request.data;
    const geolocation = assistant.request.geolocation;
    const client = assistant.request.client;

    // Set options
    options = options || {};
    options.authenticate = typeof options.authenticate === 'boolean' ? options.authenticate : true;
    options.setupAnalytics = typeof options.setupAnalytics === 'boolean' ? options.setupAnalytics : true;
    options.setupUsage = typeof options.setupUsage === 'boolean' ? options.setupUsage : true;
    options.setupSettings = typeof options.setupSettings === 'undefined' ? true : options.setupSettings;
    options.cleanSettings = typeof options.cleanSettings === 'undefined' ? true : options.cleanSettings;
    options.includeNonSchemaSettings = typeof options.includeNonSchemaSettings === 'undefined' ? false : options.includeNonSchemaSettings;
    options.schema = typeof options.schema === 'undefined' ? undefined : options.schema;

    // Set base path
    options.routesDir = typeof options.routesDir === 'undefined' ? `${Manager.cwd}/routes` : options.routesDir;
    options.schemasDir = typeof options.schemasDir === 'undefined' ? `${Manager.cwd}/schemas` : options.schemasDir;

    // Log
    assistant.log(`Middleware.process(): Request (${geolocation.ip} @ ${geolocation.country}, ${geolocation.region}, ${geolocation.city})`, JSON.stringify(data));

    // Set paths
    const routesDir = path.resolve(options.routesDir, libPath.replace('.js', ''));
    const schemasDir = path.resolve(options.schemasDir);

    // Wakeup trigger (quit immediately if wakeup is true to avoid cold start on a future request)
    if (data.wakeup) {
      assistant.log(`Middleware.process(): Wakeup activated at ${new Date().toISOString()}`);

      return assistant.respond({wakeup: true});
    }

    // Load library
    let library;
    try {
      libPath = path.resolve(routesDir, `index.js`);
      library = new (require(libPath))();
    } catch (e) {
      return assistant.respond(new Error(`Unable to load library @ (${libPath}): ${e.message}`), {code: 500, sentry: true});
    }

    // Setup user
    if (!options.setupUsage && options.authenticate) {
      await assistant.authenticate();
    }

    // Setup usage
    if (options.setupUsage) {
      // assistant.usage = await Manager.Usage().init(assistant, {log: assistant.isProduction()});
      assistant.usage = await Manager.Usage().init(assistant, {log: false});
    }

    // Log working user
    const workingUser = assistant.getUser();
    assistant.log(`Middleware.process(): User (${workingUser.auth.uid}, ${workingUser.auth.email}, ${workingUser.plan.id}=${workingUser.plan.status}):`, JSON.stringify(workingUser));

    // Setup analytics
    if (options.setupAnalytics) {
      const uuid = assistant?.usage?.user?.auth?.uid
        || assistant.request.user.auth.uid
        || assistant.request.geolocation.ip

      assistant.analytics = Manager.Analytics({
        assistant: assistant,
        uuid: uuid,
      });
    }

    // Resolve settings
    if (options.setupSettings) {
      // Resolve settings
      try {
        // Attach schema to assistant
        assistant.schema.dir = schemasDir;
        assistant.schema.name = options.schema;
        assistant.settings = Manager.Settings().resolve(assistant, undefined, data, {dir: schemasDir, schema: options.schema});
      } catch (e) {
        return assistant.respond(new Error(`Unable to resolve schema ${options.schema}: ${e.message}`), {code: 500, sentry: true});
      }

      // Merge settings with data
      if (options.includeNonSchemaSettings) {
        assistant.settings = merge(data, assistant.settings)
      }

      // Clean settings by looping through and trimming all strings
      if (options.cleanSettings) {
        clean(assistant.settings);
      }

      // Log
      assistant.log(`Middleware.process(): Resolved settings with schema ${options.schema}`, JSON.stringify(assistant.settings));
    } else {
      assistant.settings = data;
    }

    // Process
    try {
      // Set properties
      library.Manager = Manager;
      library.assistant = assistant;

      // Run library
      library.main(assistant, req, res)
      .catch(e => {
        return assistant.respond(e, {code: e.code, sentry: true});
      });
    } catch (e) {
      return assistant.respond(e, {code: e.code, sentry: true});
    }
  });
};

function clean(obj) {
  for (let key in obj) {
    if (typeof obj[key] === 'object') {
      clean(obj[key]);
    } else if (typeof obj[key] === 'string') {
      obj[key] = obj[key]
        .trim();
    }
  }
}

module.exports = Middleware;
