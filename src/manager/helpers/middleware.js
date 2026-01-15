/**
 * Middleware
 * Used to handle middleware for the assistant
 */

const path = require('path');
const powertools = require('node-powertools');
const { merge } = require('lodash');
const JSON5 = require('json5');

function Middleware(m, req, res) {
  const self = this;

  self.Manager = m;
  self.req = req;
  self.res = res;
}

Middleware.prototype.run = function (libPath, options) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const req = self.req;
  const res = self.res;
  const { cors } = Manager.libraries;

  return cors(req, res, async () => {
    const assistant = Manager.Assistant({req: req, res: res});

    // Set options
    options = options || {};
    options.authenticate = typeof options.authenticate === 'boolean' ? options.authenticate : true;
    options.setupAnalytics = typeof options.setupAnalytics === 'boolean' ? options.setupAnalytics : true;
    options.setupUsage = typeof options.setupUsage === 'boolean' ? options.setupUsage : true;
    options.setupSettings = typeof options.setupSettings === 'undefined' ? true : options.setupSettings;
    options.cleanSettings = typeof options.cleanSettings === 'undefined' ? true : options.cleanSettings;
    options.includeNonSchemaSettings = typeof options.includeNonSchemaSettings === 'undefined' ? false : options.includeNonSchemaSettings;
    options.schema = typeof options.schema === 'undefined' ? undefined : options.schema;
    options.parseMultipartFormData = typeof options.parseMultipartFormData === 'undefined' ? true : options.parseMultipartFormData;

    // Set base path
    options.routesDir = typeof options.routesDir === 'undefined' ? `${Manager.cwd}/routes` : options.routesDir;
    options.schemasDir = typeof options.schemasDir === 'undefined' ? `${Manager.cwd}/schemas` : options.schemasDir;

    // Parse multipart/form-data if needed
    if (options.parseMultipartFormData && req.headers['content-type']?.includes('multipart/form-data')) {
      try {
        const parsed = await assistant.parseMultipartFormData();

        // Add each field to the body either as a whole json object or each field
        // Parsed JSON
        if (parsed.fields.json) {
          assistant.request.body = JSON5.parse(parsed.fields.json || '{}');
        } else {
          assistant.request.body = parsed.fields;
        }

        // Re-assign data how assistant normally does it
        assistant.request.data = merge({}, assistant.request.body, assistant.request.query);

        // Log that it was parsed successfully
        assistant.log(`Middleware.run(): Parsed multipart form data successfully`);
      } catch (e) {
        return assistant.respond(new Error(`Failed to parse multipart form data: ${e.message}`), {code: 400, sentry: true});
      }
    }

    // Set properties
    const data = assistant.request.data;
    const headers = assistant.request.headers;
    const method = assistant.request.method.toLowerCase();
    const url = assistant.request.url;
    const geolocation = assistant.request.geolocation;
    const client = assistant.request.client;

    // Strip URL
    const strippedUrl = stripUrl(url);

    // Log
    assistant.log(`Middleware.process(): Request (${geolocation.ip} @ ${geolocation.country}, ${geolocation.region}, ${geolocation.city}) [${method} > ${strippedUrl}]`, safeStringify(data));
    assistant.log(`Middleware.process(): Headers`, safeStringify(headers));

    // Set paths
    const routesDir = path.resolve(options.routesDir, libPath.replace('.js', ''));
    const schemasDir = path.resolve(options.schemasDir);

    // Wakeup trigger (quit immediately if wakeup is true to avoid cold start on a future request)
    if (data.wakeup) {
      assistant.log(`Middleware.process(): Wakeup activated at ${new Date().toISOString()}`);

      return assistant.respond({wakeup: true});
    }

    // Load route handler
    // First try method-specific file (e.g., get.js, post.js), then fallback to index.js
    let routeHandler;

    try {
      const methodFile = `${method}.js`;
      const methodFilePath = path.resolve(routesDir, methodFile);

      try {
        routeHandler = require(methodFilePath);
        assistant.log(`Middleware.process(): Loaded route: ${methodFile}`);
      } catch (methodError) {
        // Fallback to index.js if method-specific file doesn't exist
        const indexPath = path.resolve(routesDir, 'index.js');
        routeHandler = require(indexPath);
        assistant.log(`Middleware.process(): Method-specific file (${methodFile}) not found, using index.js`);
      }
    } catch (e) {
      return assistant.respond(new Error(`Unable to load route @ (${libPath}): ${e.message}`), {code: 500, sentry: true});
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
    assistant.log(`Middleware.process(): User (${workingUser.auth.uid}, ${workingUser.auth.email}, ${workingUser.plan.id}=${workingUser.plan.status}):`, safeStringify(workingUser));

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
        // assistant.schema.dir = schemasDir;
        // assistant.schema.name = options.schema;
        assistant.settings = Manager.Settings().resolve(assistant, undefined, data, {dir: schemasDir, schema: options.schema});
      } catch (e) {
        return assistant.respond(new Error(`Unable to resolve schema ${options.schema}: ${e.message}`), {code: e.code || 500, sentry: true});
      }

      // // Here we need to include IF it exists the backendManagerKey and the apiKey
      // if (data.backendManagerKey) {
      //   assistant.settings.backendManagerKey = data.backendManagerKey;
      // }
      // if (data.apiKey) {
      //   assistant.settings.apiKey = data.apiKey;
      // }

      // Merge settings with data
      if (options.includeNonSchemaSettings) {
        assistant.settings = merge(data, assistant.settings)
      }

      // Clean settings by looping through and trimming all strings
      if (options.cleanSettings) {
        clean(assistant.settings);
      }

      // Log
      assistant.log(`Middleware.process(): Resolved settings with schema=${options.schema}`, safeStringify(assistant.settings));

      // Log multipart files if they exist
      const files = assistant.request.multipartData.files || {};
      if (files) {
        assistant.log(`Middleware.process(): Multipart files`, safeStringify(files));
      }
    } else {
      assistant.settings = data;
    }

    // Execute route handler
    try {
      routeHandler(assistant)
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

function stripUrl(url) {
  const newUrl = new URL(url);

  return `${newUrl.hostname}${newUrl.pathname}`.replace(/\/$/, '');
}

// Helper to safely stringify objects by truncating long strings (like base64)
function safeStringify(obj, maxLength = 100) {
  const truncate = (value) => {
    if (typeof value === 'string' && value.length > maxLength) {
      return `${value.substring(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
    }
    return value;
  };

  const truncated = JSON.parse(JSON.stringify(obj, (key, value) => truncate(value)));
  return JSON.stringify(truncated);
}

module.exports = Middleware;
