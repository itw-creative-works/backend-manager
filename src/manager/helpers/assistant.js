const os = require('os');
const path = require('path');
const _ = require('lodash');
const uuid = require('uuid');
let JSON5;

const LOG_LEVELS = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  log: 'log',
  notice: 'NOTICE',
  critical: 'CRITICAL',
  emergency: 'EMERGENCY'
};

function BackendAssistant() {
  const self = this;

  // Set ref
  self.meta = {};
  self.initialized = false;

  // Add log methods
  Object.keys(LOG_LEVELS)
  .forEach((level) => {
    // Skip log because it is already a method
    // if (level === 'log') {
    //   return;
    // }

    // Add log method
    BackendAssistant.prototype[level] = function() {
      const self = this;
      const args = Array.prototype.slice.call(arguments);

      // Prepend level to args
      args.unshift(level);
      // self.log.apply(this, args);
      self._log.apply(this, args);
    };
  });

  return self;
}

function tryUrl(self) {
  const req = self.ref.req;
  const Manager = self.Manager;
  const projectType = Manager?.options?.projectType;


  try {
    const protocol = req.protocol;
    const host = req.get('host');
    const forwardedHost = req.get('x-forwarded-host');
    const path = req.path;
    const functionsUrl = Manager.getFunctionsUrl();

    // Like this becuse "req.originalUrl" does NOT have path for all cases (like when calling https://us-central1-{id}.cloudfunctions.net/giftImport)
    if (projectType === 'firebase') {
      // Non-production (development OR testing) reconstructs the URL from the local
      // functions URL; production uses the request host.
      if (!self.isProduction()) {
        return forwardedHost
          ? `${protocol}://${forwardedHost}${path}`
          : `${functionsUrl}/${self.meta.name}`;
      } else {
        return forwardedHost
          ? `${protocol}://${forwardedHost}${path}`
          : `${protocol}://${host}/${self.meta.name}`;
      }
    } else if (projectType === 'custom') {
      return `${protocol}://${host}${path}`;
    }

    return '';
  } catch (e) {
    // self.warn('Could not get URL', e);
    return '';
  }
}

function tryParse(input) {
  var parsed;

  // Try to require JSON5
  JSON5 = JSON5 || require('json5');

  // Try to parse
  try {
    parsed = JSON5.parse(input);
  } catch (e) {
    parsed = input
  }

  // Return
  return parsed;
}

BackendAssistant.prototype.init = function (ref, options) {
  const self = this;

  // Set options
  options = options || {};
  options.accept = options.accept || 'json';
  options.showOptionsLog = typeof options.showOptionsLog !== 'undefined' ? options.showOptionsLog : false;
  options.optionsLogString = typeof options.optionsLogString !== 'undefined' ? options.optionsLogString : '\n\n\n\n\n';
  options.fileSavePath = options.fileSavePath || process.env.npm_package_name || '';

  // Set now
  const now = new Date();

  // Attached libraries - used in .errorify()
  self.analytics = null;
  self.usage = null;
  self.settings = null;
  self.schema = null;

  // Set ref FIRST so self.Manager is available below — meta.environment forwards to the
  // Manager's canonical getEnvironment() (the Manager is the SSOT), so the Manager ref must
  // be wired before we resolve the environment.
  ref = ref || {};

  // An assistant has no independent identity — it's a request-scoped face for its Manager,
  // and forwards environment/url resolution to it. A Manager ref is REQUIRED; constructing
  // one without it is a programming error (use Manager.Assistant(), which injects it).
  if (!ref.Manager || typeof ref.Manager.getEnvironment !== 'function') {
    throw new Error('BackendAssistant.init(): a Manager reference is required (ref.Manager). Construct via Manager.Assistant() so it is injected automatically.');
  }

  self.ref = {};
  self.ref.req = ref.req || {};
  self.ref.res = ref.res || {};
  self.ref.admin = ref.admin || {};
  self.ref.functions = ref.functions || {};
  self.ref.Manager = ref.Manager;
  self.Manager = self.ref.Manager;

  // Set meta
  self.meta = {};

  self.meta.startTime = {};
  self.meta.startTime.timestamp = now.toISOString();
  self.meta.startTime.timestampUNIX = Math.round((now.getTime()) / 1000);

  self.meta.name = options.functionName || process.env.FUNCTION_TARGET || 'unnamed';
  self.meta.environment = options.environment || self.getEnvironment();
  self.meta.type = options.functionType || process.env.FUNCTION_SIGNATURE_TYPE || 'unknown';

  // Set ID
  try {
    const headers = self?.ref?.req.headers || {};

    self.id = headers['function-execution-id']
      || headers['X-Cloud-Trace-Context']
      || self.Manager.Utilities().randomId();
  } catch {
    self.id = now.getTime();
  }

  // Set tag
  self.tag = `${self.meta.name}/${self.id}`;

  // Set logger prefix
  self.logPrefix = '';

  // Set stuff about request
  self.request = {};
  self.request.referrer = self.ref.req.headers?.referrer || self.ref.req.headers?.referer || '';
  self.request.method = self.ref.req.method || undefined;

  // Set geolocation data
  self.request.geolocation =  {
    ip: self.getHeaderIp(self.ref.req.headers),
    continent: self.getHeaderContinent(self.ref.req.headers),
    country: self.getHeaderCountry(self.ref.req.headers),
    region: self.getHeaderRegion(self.ref.req.headers),
    city: self.getHeaderCity(self.ref.req.headers),
    latitude: self.getHeaderLatitude(self.ref.req.headers),
    longitude: self.getHeaderLongitude(self.ref.req.headers),
  };

  // Set client data
  self.request.client = {
    userAgent: self.getHeaderUserAgent(self.ref.req.headers),
    language: self.getHeaderLanguage(self.ref.req.headers),
    platform: self.getHeaderPlatform(self.ref.req.headers),
    mobile: self.getHeaderMobile(self.ref.req.headers),
    url: self.getHeaderUrl(self.ref.req.headers),
  };

  // Deprecated notice for old properties
  Object.defineProperty(self.request, 'ip', {
    get: function() {
      console.error('⛔️ [Deprecation]: request.ip is deprecated, use request.geolocation.ip instead');
      return self.request.geolocation.ip;
    }
  });
  Object.defineProperty(self.request, 'country', {
    get: function() {
      console.error('⛔️ [Deprecation]: request.country is deprecated, use request.geolocation.country instead');
      return self.request.geolocation.country;
    }
  });
  Object.defineProperty(self.request, 'userAgent', {
    get: function() {
      console.error('⛔️ [Deprecation]: request.userAgent is deprecated, use request.client.userAgent instead');
      return self.request.client.userAgent;
    }
  });

  /*
    MORE HEADERS TO GET
    https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-CH-UA-Platform-Version
    https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-CH-UA-Model
    https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-CH-UA-Mobile
    https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-CH-UA-Full-Version-List
    https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-CH-UA-Full-Version
    https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-CH-UA-Arch
    https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-CH-UA
  */

  // Set request type
  if (
    self.ref.req.xhr || (self.ref.req?.headers?.accept || '').includes('json')
    || (self.ref.req?.headers?.['content-type'] || '').includes('json')
  ) {
    self.request.type = 'ajax';
  } else {
    self.request.type = 'form';
  }
  self.request.url = tryUrl(self);
  self.request.path = self.ref.req.path || '';
  self.request.user = self.Manager.User({}).properties;
  self.request.user.authenticated = false;

  // Set body and query
  if (options.accept === 'json') {
    self.request.body = tryParse(self.ref.req.body || '{}');
    self.request.query = tryParse(self.ref.req.query || '{}');
  }

  // Set headers
  self.request.headers = self.ref.req.headers || {};

  // Merge data
  self.request.data = _.merge({}, self.request.body, self.request.query);

  // Set multipart data
  self.request.multipartData = {
    fields: {},
    files: {},
  };

  // Log the request
  // if (Object.keys(self.request.data).length > 0) {
  //   self.log('Request:', self.request.data, {
  //     ip: self.request.ip,
  //   });
  // }

  // Constants
  self.constant = {};
  self.constant.pastTime = {};
  self.constant.pastTime.timestamp = '1999-01-01T00:00:00Z';
  self.constant.pastTime.timestampUNIX = 915148800;

  // Log options
  if (
    (self.isDevelopment())
    && ((self.request.method !== 'OPTIONS') || (self.request.method === 'OPTIONS' && options.showOptionsLog))
    && (self.request.method !== 'undefined')
    // && (self.request.method !== 'undefined' && typeof self.request.method !== 'undefined')
  ) {
    console.log(options.optionsLogString);
  }

  // Set tmpdir
  self.tmpdir = path.resolve(os.tmpdir(), options.fileSavePath, uuid.v4());

  // Set initialized
  self.initialized = true;

  return self;
};

// Environment helpers — the Manager is the SINGLE SOURCE OF TRUTH (see index.js). The
// assistant is a request-scoped face for its Manager and FORWARDS these straight through,
// so request handlers can call `assistant.getEnvironment()` / `assistant.isTesting()` and
// get exactly the same answer as `Manager.getEnvironment()`. No duplicated env-var logic
// lives here — there is one implementation, on the Manager. A Manager ref is guaranteed by
// init() (it throws otherwise), so these never need a fallback.
//
// Returns exactly ONE of 'development' | 'testing' | 'production' (mutually exclusive,
// testing wins). isDevelopment() is NOT true in testing; isProduction() is a real positive
// check (never `!isDevelopment()`). Gate "anything non-production" with `!isProduction()`
// or `isDevelopment() || isTesting()` intentionally.
BackendAssistant.prototype.getEnvironment = function () {
  return this.Manager.getEnvironment();
}

BackendAssistant.prototype.isDevelopment = function () {
  return this.Manager.isDevelopment();
}

BackendAssistant.prototype.isProduction = function () {
  return this.Manager.isProduction();
}

BackendAssistant.prototype.isTesting = function () {
  return this.Manager.isTesting();
}

BackendAssistant.prototype.logProd = function () {
  const self = this;

  self._log.apply(self, args);
};

BackendAssistant.prototype._log = function () {
  const self = this;
  const logs = [...arguments];
  const prefix = self.logPrefix ? ` ${self.logPrefix}:` : ':';

  // Prepend log prefix log string
  logs.unshift(`[${new Date().toISOString()}] ${self.tag}${prefix}`);

  // Get the log level
  const level = logs[1];

  // Pass along arguments to console.log
  if (LOG_LEVELS[level]) {
    logs.splice(1, 1);

    // Determine how to log. Console for any non-production environment (development OR
    // testing); the Firebase Cloud logger only in production.
    if (level in console) {
      console[level].apply(console, logs);
    } else if (!self.isProduction()) {
      console.log.apply(console, logs);
    } else {
      self.ref.functions.logger.write({
        severity: LOG_LEVELS[level].toUpperCase(),
        message: logs,
      });
    }

    // Write with wonderful-log
    if (self.Manager?.libraries?.logger?.[level]) {
      self.Manager?.libraries?.logger?.[level](...logs)
    }
  } else {
    console.log.apply(console, logs);
  }
};

BackendAssistant.prototype.setLogPrefix = function (s) {
  const self = this;

  // Set logger prefix
  self.logPrefix = s

  return self;
};

BackendAssistant.prototype.clearLogPrefix = function () {
  const self = this;

  // Set logger prefix
  self.logPrefix = '';

  return self;
};

BackendAssistant.prototype.getLogPrefix = function () {
  const self = this;

  return self.logPrefix;
};

BackendAssistant.prototype.getUser = function () {
  const self = this;

  return self?.usage?.user || self.request.user;
}

BackendAssistant.prototype.errorify = function (e, options) {
  const self = this;
  const res = self.ref.res;

  // Set options
  options = options || {};

  // Code: default to 500, or else use the user's option
  const isCodeSet = typeof options.code !== 'undefined';
  options.code = !isCodeSet
    ? 500
    : options.code;

  // Sentry: default to false, or else use the user's option
  options.sentry = typeof options.sentry === 'undefined'
    ? false
    : options.sentry;

  // Log: default to sentry, or else use the user's option
  options.log = typeof options.log === 'undefined'
    ? options.sentry
    : options.log;

  // Send: default to false, or else use the user's option
  options.send = typeof options.send === 'undefined'
    ? false
    : options.send;

  // Stack: default to false, or else use the user's option
  options.stack = typeof options.stack === 'undefined'
    ? false
    : options.stack;

  // Construct error
  const newError = e instanceof Error
    ? e
    : new Error(stringifyNonStrings(e));

  // Fix code
  // options.code = newError.code || options.code;
  options.code = isCodeSet ? options.code : newError.code || options.code;
  options.code = parseInt(options.code);
  options.code = isBetween(options.code, 400, 599) ? options.code : 500;

  // Attach properties
  _attachHeaderProperties(self, options, newError);

  // Log the error (only log 500-level errors as actual errors, 400-level are client errors)
  if (options.log) {
    if (isBetween(options.code, 500, 599)) {
      self.error(newError);
    } else {
      self.log(`⚠️ Client error (${options.code}):`, newError.message, newError.stack);
    }
  }

  // Send error to Sentry (only for 500-level server errors, not client errors)
  if (options.sentry && isBetween(options.code, 500, 599)) {
    self.Manager.libraries.sentry.captureException(newError);
  }

  // Quit and respond to the request only if the assistant has a res (it sometimes does not, like in auth().onCreate() triggers)
  if (options.send && res?.status) {
    let sendable = newError?.stack && options.stack
      ? newError?.stack
      : newError?.message;

    // Set error
    sendable = `${sendable || newError || 'Unknown error'}`;

    // Attach tag
    if (newError.tag) {
      // sendable = `(${newError.tag}) ${sendable}`;
      sendable = `${sendable} (${newError.tag})`;
    }

    // Clear log prefix before sending
    self.clearLogPrefix();

    // Log
    if (options.log) {
      self.log(`Sending response (${options.code}):`, JSON.stringify(sendable));
    }

    // Send response
    res
      .status(options.code)
      .send(sendable);
  }

  return newError;
}

BackendAssistant.prototype.errorManager = BackendAssistant.prototype.errorify;

BackendAssistant.prototype.redirect = function(response, options) {
  const self = this;
  const res = self.ref.res;

  // Set options
  options = options || {};
  options.code = typeof options.code === 'undefined'
    ? 302
    : options.code;

  return self.respond(response, options);
}

BackendAssistant.prototype.respond = function(response, options) {
  const self = this;
  const res = self.ref.res;

  // If response is a promise, wait for it to resolve and then call respond again with the resolved value
  if (response && typeof response.then === 'function') {
    return response
      .then(resolved => self.respond(resolved, options))
      .catch(error => self.respond(error, options));
  }

  // Set options
  options = options || {};
  options.code = typeof options.code === 'undefined'
    ? 200
    : options.code;
  options.log = typeof options.log === 'undefined'
    ? true
    : options.log;

  // Fix code
  options.code = parseInt(options.code);

  // Handle error
  const isErrorCode = isBetween(options.code, 400, 599);
  if (
    response instanceof Error
    || isErrorCode
  ) {
    options.code = isErrorCode ? options.code : undefined;
    options.send = true;

    return self.errorify(response, options);
  }

  // Attach properties
  _attachHeaderProperties(self, options);

  // Send response
  res.status(options.code);

  // Log function
  function _log(text) {
    if (options.log) {
      self.log(`${text} (${options.code}):`, JSON.stringify(response));
    }
  }

  // Clear log prefix before sending
  self.clearLogPrefix();

  // Redirect
  const isRedirect = isBetween(options.code, 300, 399);
  if (isRedirect) {
    // Log
    _log(`Redirecting`);

    // Send
    return res.redirect(response);
  }

  // Log
  _log(`Sending response`);

  // If it is an object, send as json
  if (
    response
    && typeof response === 'object'
    && typeof res.json === 'function'
  ) {
    return res.json(response);
  } else {
    return res.send(response);
  }
}

function isBetween(value, min, max) {
  return value >= min && value <= max;
}

function stringifyNonStrings(e) {
  if (typeof e === 'string') {
    return e;
  } else {
    return JSON.stringify(e);
  }
}

function _attachHeaderProperties(self, options, error) {
  // Create headers
  const headers = {
    code: options.code,
    tag: self.tag,
    usage: {
      current: self.usage ? self.usage.getUsage() : {},
      limits: self.usage ? self.usage.getLimit() : {},
    },
    schema: self.schema || {},
    additional: options.additional || {},
  }
  const req = self.ref.req;
  const res = self.ref.res;

  // Attach properties if this assistant has a res (it sometimes does not, like in auth().onCreate() triggers)
  if (res?.header && res?.get) {
    res.header('bm-properties', JSON.stringify(headers));

    // Add bm-properties to Access-Control-Expose-Headers
    const existingExposed = res.get('Access-Control-Expose-Headers') || '';

    // If it does not exist, add it
    if (!existingExposed.match(/bm-properties/i)) {
      const newExposed = `${existingExposed}, bm-properties`.replace(/^, /, '');
      res.header('Access-Control-Expose-Headers', newExposed);
    }
  }

  // Attach properties
  if (error) {
    Object.keys(headers)
    .forEach((item, i) => {
      error[item] = headers[item];
    });
  }
}

BackendAssistant.prototype.authenticate = async function (options) {
  const self = this;

  // Shortcuts
  const admin = self.ref.admin;
  const functions = self.ref.functions;
  const req = self.ref.req;
  const res = self.ref.res;
  const data = self.request.data;

  // Get stored backendManagerKey
  const BACKEND_MANAGER_KEY = process.env.BACKEND_MANAGER_KEY || '';

  // Build the ID token from the request
  let idToken;
  let backendManagerKey;
  // let user;

  // Set options
  options = options || {};
  options.resolve = typeof options.resolve === 'undefined' ? true : options.resolve;
  options.debug = typeof options.debug === 'undefined' ? false : options.debug;

  function _resolve(user) {
    // Resolve the properties
    user = user || {};
    user.authenticated = typeof user.authenticated === 'undefined'
      ? false
      : user.authenticated;

    // Validate BACKEND_MANAGER_KEY
    if (backendManagerKey && backendManagerKey === BACKEND_MANAGER_KEY) {
      // Update roles
      user.roles = user.roles || {};
      user.roles.admin = true;

      // Set authenticated
      user.authenticated = true;
    }

    // Resolve the user
    if (options.resolve) {
      self.request.user = self.Manager.User(user).properties;
      self.request.user.authenticated = user.authenticated || false;
      return self.request.user;
    } else {
      return user;
    }
  }

  // Get shortcuts
  const authHeader = req?.headers?.authorization || '';

  // Extract the BEM token
  // Having this is separate from the ID token allows for the user to be authenticated as an ADMIN
  if (options.backendManagerKey || data.backendManagerKey) {
    // Read token from backendManagerKey or authenticationToken or apiKey
    backendManagerKey = options.backendManagerKey || data.backendManagerKey;

    // Log the token
    self.log('Found "backendManagerKey" parameter', backendManagerKey);
  }

  // Extract the token / API key
  // This is the main token that will be used to authenticate the user (it can be a JWT or a user's API key)
  if (authHeader.startsWith('Bearer ')) {
    // Read the ID Token from the Authorization header.
    idToken = authHeader.split('Bearer ')[1];

    // Log the token
    self.log('Found "Authorization" header', idToken);
  } else if (req?.cookies?.__session) {
    // Read the ID Token from cookie.
    idToken = req.cookies.__session;

    // Log the token
    self.log('Found "__session" cookie', idToken);
  } else if (
    options.authenticationToken || data.authenticationToken
    || options.apiKey || data.apiKey
  ) {
    // Read token OR API Key from options or data
    idToken = options.authenticationToken || data.authenticationToken
    || options.apiKey || data.apiKey;

    // Log the token
    self.log('Found "authenticationToken" parameter', idToken);
  } else {
    // No token found
    return _resolve(self.request.user);
  }

  // Check if the token is a JWT
  if (isJWT(idToken)) {
    // Check with firebase
    try {
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);

      // Log the token
      if (options.debug) {
        self.log('JWT token decoded', decodedIdToken.email, decodedIdToken.user_id);
      }

      // Get the user
      await admin.firestore().doc(`users/${decodedIdToken.user_id}`)
      .get()
      .then((doc) => {
        // Set the user
        if (doc.exists) {
          self.request.user = Object.assign({}, self.request.user, doc.data());
          self.request.user.authenticated = true;
          self.request.user.auth.uid = decodedIdToken.user_id;
          self.request.user.auth.email = decodedIdToken.email;
        }

        // Log the user
        if (options.debug) {
          self.log('Found user doc', self.request.user)
        }
      })

      // Return the user
      return _resolve(self.request.user);
    } catch (error) {
      self.error('Error while verifying JWT:', error);

      // Return the user
      return _resolve(self.request.user);
    }
  } else {
    // Query by API key
    await admin.firestore().collection(`users`)
      .where('api.privateKey', '==', idToken)
      .get()
      .then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          self.request.user = doc.data();
          self.request.user = Object.assign({}, self.request.user, doc.data());
          self.request.user.authenticated = true;
        });
      })
      .catch((error) => {
        console.error('Error getting documents: ', error);
      });

    // Return the user
    return _resolve(self.request.user);
  }
};


BackendAssistant.prototype.parseRepo = function (repo) {
  let repoSplit = repo.split('/');

  // Remove .git from the end
  for (var i = 0; i < repoSplit.length; i++) {
    repoSplit[i] = repoSplit[i].replace('.git', '');
  }

  // Remove unnecessary parts
  repoSplit = repoSplit.filter((value, index, arr) => {
    return value !== 'http:'
      && value !== 'https:'
      && value !== ''
      && value !== 'github.com';
  });

  // Return
  return {
    user: repoSplit[0],
    name: repoSplit[1],
  }
};

BackendAssistant.prototype.getHeaderIp = function (headers) {
  headers = headers || {};

  const value =
    // these are present for cloudflare requests (11/21/2020)
    headers['cf-connecting-ip']
    || headers['fastly-temp-xff']

    // these are present for non-cloudflare requests (11/21/2020)
    || headers['x-appengine-user-ip']
    || headers['x-forwarded-for'];

    // Not sure about these
    // || headers['fastly-client-ip']

  return value ? value.split(',')[0].trim() : null;
}

BackendAssistant.prototype.getHeaderContinent = function (headers) {
  headers = headers || {};

  const value =
    // these are present for cloudflare requests (11/21/2020)
    headers['cf-ipcontinent'];

  return value ? value.split(',')[0].trim() : null;
}

BackendAssistant.prototype.getHeaderCountry = function (headers) {
  headers = headers || {};

  const value =
    // these are present for cloudflare requests (11/21/2020)
    headers['cf-ipcountry']

    //
    || headers['x-country-code']

    // these are present for non-cloudflare requests (11/21/2020)
    || headers['x-appengine-country'];

  return value ? value.split(',')[0].trim() : null;
}

BackendAssistant.prototype.getHeaderRegion = function (headers) {
  headers = headers || {};

  const value =
    // these are present for cloudflare requests (11/21/2020)
    headers['cf-region']

    // these are present for non-cloudflare requests (11/21/2020)
    || headers['x-appengine-region'];

  return value ? value.split(',')[0].trim() : null;
}

BackendAssistant.prototype.getHeaderCity = function (headers) {
  headers = headers || {};

  const value =
    // these are present for cloudflare requests (11/21/2020)
    headers['cf-ipcity']

    || headers['x-appengine-city'];

  return value ? value.split(',')[0].trim() : null;
}

BackendAssistant.prototype.getHeaderLatitude = function (headers) {
  headers = headers || {};

  return parseFloat((
    // these are present for cloudflare requests (11/21/2020)
    headers['cf-iplatitude']

    || (headers['x-appengine-citylatlong'] || '').split(',')[0]

    // If unsure, return unknown
    || '0'
  )
  .split(',')[0]
  .trim());
}

BackendAssistant.prototype.getHeaderLongitude = function (headers) {
  headers = headers || {};

  return parseFloat((
    // Cloudflare requests
    headers['cf-iplongitude']

    || (headers['x-appengine-citylatlong'] || '').split(',')[1]

    // If unsure, return unknown
    || '0'
  )
  .split(',')[0]
  .trim());
}


BackendAssistant.prototype.getHeaderUserAgent = function (headers) {
  headers = headers || {};

  const value = headers['user-agent'];

  return value ? value.trim() : null;
}

BackendAssistant.prototype.getHeaderLanguage = function (headers) {
  headers = headers || {};

  const value =
    headers['accept-language']
    || headers['x-orig-accept-language'];

  return value ? value.trim() : null;
}

BackendAssistant.prototype.getHeaderPlatform = function (headers) {
  headers = headers || {};

  const value = headers['sec-ch-ua-platform'];

  return value ? value.replace(/"/ig, '').trim() : null;
}

BackendAssistant.prototype.getHeaderMobile = function (headers) {
  headers = headers || {};

  // Will be ?0 if fale or ?1 if true
  const mobile = (headers['sec-ch-ua-mobile'] || '').replace(/\?/ig, '');

  return mobile === '1' || mobile === true || mobile === 'true';
}

BackendAssistant.prototype.getHeaderUrl = function (headers) {
  const self = this;
  headers = headers || {};

  const value =
    // Origin header (most reliable for CORS requests)
    headers['origin']

    // Fallback to referrer/referer
    || headers['referrer']
    || headers['referer']

    // Reconstruct from host and path if available
    || (headers['host'] ? `https://${headers['host']}${self.ref.req?.originalUrl || self.ref.req?.url || ''}` : null);

  return value ? value.trim() : null;
}

/**
 * Parses a 'multipart/form-data' upload request
 *
 * @param {Object} req Cloud Function request context.
 * @param {Object} res Cloud Function response context.
 */
 // https://cloud.google.com/functions/docs/writing/http#multipart_data
BackendAssistant.prototype.parseMultipartFormData = function (options) {
  const self = this;
  return new Promise(function(resolve, reject) {
    if (!self.initialized) {
      return reject(new Error('Cannot run .parseMultipartForm() until .init() has been called'));
    }
    const existingData = self.request.multipartData;
    const getFields = existingData?.fields || {};
    const getFiles = existingData?.files || {};

    // If there are already fields or files, return them
    if (Object.keys(getFields).length + Object.keys(getFiles).length > 0) {
      return resolve(existingData);
    }

    // Set options
    options = options || {};

    // Set headers
    const fs = require('fs');
    const req = self.ref.req;
    const res = self.ref.res;

    // Node.js doesn't have a built-in multipart/form-data parsing library.
    // Instead, we can use the 'busboy' library from NPM to parse these requests.
    const busboy = require('busboy');
    const jetpack = require('fs-jetpack');

    // if (req.method !== 'POST') {
    //   // Return a "method not allowed" error
    //   return res.status(405).end();
    // }
    options.headers = options.headers || req.headers;
    options.limits = options.limits || {};

    // console.log('++++++++options.headers', options.headers);
    // console.log('++++++++req.rawBody', req.rawBody);
    // console.log('++++++++options.limits', options.limits);
    // console.log('----req.rawBody', req.rawBody);

    // https://github.com/mscdex/busboy
    // https://github.com/mscdex/busboy/issues/266
    const bb = busboy({
      headers: options.headers,
      limits: options.limits,
    });

    // This object will accumulate all the fields, keyed by their name
    const fields = {};

    // This object will accumulate all the uploaded files, keyed by their name.
    const uploads = {};

    // This code will process each non-file field in the form.
    bb.on('field', (fieldname, val, info) => {
      // console.log(`Processed field ${fieldname}: ${val}.`);
      fields[fieldname] = val;
    });

    const fileWrites = [];

    // This code will process each file uploaded.
    bb.on('file', (fieldname, file, info) => {
      // file.on('error', (e) => {
      //   console.error('File error', e);
      // });
      // Note: os.tmpdir() points to an in-memory file system on GCF
      // Thus, any files in it must fit in the instance's memory.
      jetpack.dir(self.tmpdir)

      const filename = info.filename;
      const filepath = path.join(self.tmpdir, filename);
      uploads[fieldname] = filepath;
      const writeStream = fs.createWriteStream(filepath);
      file.pipe(writeStream);


      // File was processed by Busboy; wait for it to be written.
      // Note: GCF may not persist saved files across invocations.
      // Persistent files must be kept in other locations
      // (such as Cloud Storage buckets).
      const promise = new Promise((resolve, reject) => {
        file.on('end', () => {
          writeStream.end();
        });
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
      fileWrites.push(promise);
    });

    // bb.on('error', async (e) => {
    //   console.error('Busboy error', e);
    // })

    // Triggered once all uploaded files are processed by Busboy.
    // We still need to wait for the disk writes (saves) to complete.
    bb.on('finish', async () => {
      await Promise.all(fileWrites);

      /**
       * TODO(developer): Process saved files here
       */
      // for (const file in uploads) {
      //   fs.unlinkSync(uploads[file]);
      // }
      // res.send();
      self.request.multipartData = {
        fields: fields,
        files: uploads,
      }

      return resolve(self.request.multipartData);
    });

    // Because of an error when using in both Optiic glitch server and ITWCW firebase functions
    if (req.rawBody) {
      return bb.end(req.rawBody);
    } else {
      return req.pipe(bb);
    }
  });
}

const isJWT = (token) => {
  const { jwtDecode } = require('jwt-decode');

  try {
    // Decode the token and request the header
    const decoded = jwtDecode(token, { header: true });

    // Check for expected JWT keys in the header
    return decoded?.alg && decoded?.typ === 'JWT';
  } catch (err) {
    // If parsing fails, it's not a valid JWT
    return false;
  }
};

// Not sure what this is for? But it has a good serializer code
// Disabled 2024-03-21 because there was another stringify() function that i was intending to use but it was actually using this
// It was adding escaped quotes to strings
// function stringify(obj, replacer, spaces, cycleReplacer) {
//   return JSON.stringify(obj, serializer(replacer, cycleReplacer), spaces)
// }

// // https://github.com/moll/json-stringify-safe/blob/master/stringify.js
// function serializer(replacer, cycleReplacer) {
//   var stack = [], keys = []

//   if (cycleReplacer == null) cycleReplacer = function(key, value) {
//     if (stack[0] === value) return '[Circular ~]'
//     return `[Circular ~.${keys.slice(0, stack.indexOf(value)).join('.')}]`;
//   }

//   return function(key, value) {
//     if (stack.length > 0) {
//       var thisPos = stack.indexOf(this)
//       ~thisPos ? stack.splice(thisPos + 1) : stack.push(this)
//       ~thisPos ? keys.splice(thisPos, Infinity, key) : keys.push(key)
//       if (~stack.indexOf(value)) value = cycleReplacer.call(this, key, value)
//     }
//     else stack.push(value)

//     return replacer == null ? value : replacer.call(this, key, value)
//   }
// }

module.exports = BackendAssistant;
