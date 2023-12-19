/**
 * Middleware
 * Used to handle middleware for the assistant
 */

const path = require('path');

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

    // Log
    assistant.log(`Middleware.process(): Request (${geolocation.ip} @ ${geolocation.country}, ${geolocation.region}, ${geolocation.city})`, JSON.stringify(data));

    // Load library
    try {
      library = path.resolve(process.cwd(), `${library}.js`);
      library = new (require(library))();
    } catch (e) {
      assistant.errorManager(`Unable to load library @ (${library}): ${e.message}`, {sentry: true, send: true, log: true});
    }

    // Setup analytics
    if (options.setupAnalytics) {
      assistant.analytics = Manager.Analytics({
        assistant: assistant,
        uuid: assistant.request.geolocation.ip,
      })
    }

    // Setup usage
    if (options.setupUsage) {
      assistant.usage = await Manager.Usage().init(assistant);
    }

    // Process
    try {
      library.main(assistant)
      // .then(result => {
      //   return res.status(200).json(result);
      // })
      .catch(e => {
        assistant.errorManager(e, {sentry: true, send: true, log: true});
      });
    } catch (e) {
      assistant.errorManager(e, {sentry: true, send: true, log: true});
    }
  });
};

module.exports = Middleware;
