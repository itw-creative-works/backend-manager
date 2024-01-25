/**
 * Middleware
 * Used to handle middleware for the assistant
 */

const path = require('path');
const powertools = require('node-powertools');

function Middleware(m, req, res) {
  const self = this;

  self.Manager = m;
  self.req = req;
  self.res = res;
}

Middleware.prototype.run = function (library, options) {
  const self = this;
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
    options.schema = typeof options.schema === 'undefined' ? undefined : options.schema;

    // Log
    assistant.log(`Middleware.process(): Request (${geolocation.ip} @ ${geolocation.country}, ${geolocation.region}, ${geolocation.city})`, JSON.stringify(data));

    const basePath = path.resolve(process.cwd(), `methods/${library.replace('.js', '')}`);

    // Load library
    try {
      library = path.resolve(basePath, `index.js`);
      library = new (require(library))();
    } catch (e) {
      return assistant.errorify(`Unable to load library @ (${library}): ${e.message}`, {sentry: true, send: true, log: true});
    }

    // Setup user
    if (!options.setupUsage && options.authenticate) {
      await assistant.authenticate();
    }

    // Setup usage
    if (options.setupUsage) {
      assistant.usage = await Manager.Usage().init(assistant);
    }

    // Log working user
    const workingUser = assistant?.usage?.user || assistant.request.user;
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
      // assistant.log(`Middleware.process(): Resolving settings with schema ${options.schema}...`);

      try {
        assistant.settings = Manager.Settings().resolve(assistant, options.schema, data);
      } catch (e) {
        return assistant.errorify(`Unable to resolve schema ${options.schema}: ${e.message}`, {code: e.code, sentry: true, send: true, log: true});
      }

      assistant.log(`Middleware.process(): Resolved settings with schema ${options.schema}`, JSON.stringify(assistant.settings));
    }

    // Process
    try {
      // Set properties
      library.Manager = Manager;
      library.assistant = assistant;

      // Run library
      library.main(assistant, req, res)
      // .then(result => {
      //   return res.status(200).json(result);
      // })
      .catch(e => {
        return assistant.errorify(e, {sentry: true, send: true, log: true});
      });
    } catch (e) {
      return assistant.errorify(e, {sentry: true, send: true, log: true});
    }
  });
};

module.exports = Middleware;
