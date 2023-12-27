/**
 * Middleware
 * Used to handle middleware for the assistant
 */

const path = require('path');
const powertools = require('node-powertools');

function Middleware(m) {
  const self = this;

  self.Manager = m;
}

Middleware.prototype.run = function (library, req, res, options) {
  const self = this;
  const Manager = self.Manager;
  const { cors } = Manager.libraries;

  return cors(req, res, async () => {
    const assistant = Manager.Assistant({req: req, res: res});

    const data = assistant.request.data;
    const geolocation = assistant.request.geolocation;
    const client = assistant.request.client;

    // Set options
    options = options || {};
    options.setupAnalytics = typeof options.setupAnalytics === 'boolean' ? options.setupAnalytics : true;
    options.setupUsage = typeof options.setupUsage === 'boolean' ? options.setupUsage : true;
    options.authenticate = typeof options.authenticate === 'boolean' ? options.authenticate : true;
    options.setupSettings = typeof options.setupSettings === 'undefined' ? true : options.setupSettings;

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

    // Setup usage
    if (options.setupUsage) {
      assistant.usage = await Manager.Usage().init(assistant);
    }

    // Setup user
    if (!options.setupUsage && options.authenticate) {
      await assistant.authenticate();
    }

    // Setup analytics
    if (options.setupAnalytics) {
      const uuid = assistant?.usage?.user?.auth?.uid
        || assistant.request.user.auth.uid
        || assistant.request.geolocation.ip

      assistant.analytics = Manager.Analytics({
        assistant: assistant,
        uuid: uuid,
      })
    }

    // Resolve settings
    if (options.setupSettings) {
      // try {
      //   const planId = assistant.request.user.plan.id;
      //   let settings = path.resolve(basePath, `settings.js`);
      //   settings = require(settings)(assistant)[planId];
      //   assistant.request.data = powertools.defaults(data, settings);
      // } catch (e) {
      //   return assistant.errorify(`Unable to resolve settings @ (${library}): ${e.message}`, {sentry: true, send: true, log: true});
      // }
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
