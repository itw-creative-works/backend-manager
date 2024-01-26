const os = require('os');
const path = require('path');
const _ = require('lodash');
const uuid = require('uuid');
let JSON5;

function BackendAssistant() {
  this.meta = {};
  this.initialized = false;
}

function tryParse(input) {
  var ret;

  JSON5 = JSON5 || require('json5');

  try {
    ret = JSON5.parse(input);
  } catch (e) {
    ret = input
  }
  return ret;
}

BackendAssistant.prototype.init = function (ref, options) {
  const self = this;

  options = options || {};
  options.accept = options.accept || 'json';
  options.showOptionsLog = typeof options.showOptionsLog !== 'undefined' ? options.showOptionsLog : false;
  options.optionsLogString = typeof options.optionsLogString !== 'undefined' ? options.optionsLogString : '\n\n\n\n\n';
  options.fileSavePath = options.fileSavePath || process.env.npm_package_name || '';

  const now = new Date();

  // Attached libraries - used in .errorify()
  self.analytics = null;
  self.usage = null;
  self.settings = null;

  // Set meta
  self.meta = {};

  self.meta.startTime = {};
  self.meta.startTime.timestamp = now.toISOString();
  self.meta.startTime.timestampUNIX = Math.round((now.getTime()) / 1000);

  self.meta.name = options.functionName || process.env.FUNCTION_TARGET || 'unnamed';
  self.meta.environment = options.environment || self.getEnvironment();
  self.meta.type = options.functionType || process.env.FUNCTION_SIGNATURE_TYPE || 'unknown';

  // Set ref
  self.ref = {};
  ref = ref || {};
  self.ref.res = ref.res || {};
  self.ref.req = ref.req || {};
  self.ref.admin = ref.admin || {};
  self.ref.functions = ref.functions || {};
  self.ref.Manager = ref.Manager || {};
  self.Manager = self.ref.Manager;

  // Set ID
  try {
    self.id = self.ref.req.headers['function-execution-id'] || self.Manager.Utilities().randomId();
  } catch {
    self.id = now.getTime();
  }

  self.tag = `${self.meta.name}/${self.id}`;

  // Set stuff about request
  self.request = {};
  self.request.referrer = (self.ref.req.headers || {}).referrer || (self.ref.req.headers || {}).referer || '';
  self.request.method = (self.ref.req.method || undefined);

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

  self.request.type = (self.ref.req.xhr || _.get(self.ref.req, 'headers.accept', '').indexOf('json') > -1) || (_.get(self.ref.req, 'headers.content-type', '').indexOf('json') > -1) ? 'ajax' : 'form';
  self.request.path = (self.ref.req.path || '');
  self.request.user = self.resolveAccount({authenticated: false});

  if (options.accept === 'json') {
    self.request.body = tryParse(self.ref.req.body || '{}');
    self.request.query = tryParse(self.ref.req.query || '{}');
  }

  self.request.headers = (self.ref.req.headers || {});
  self.request.data = Object.assign(
    {},
    _.cloneDeep(self.request.body || {}),
    _.cloneDeep(self.request.query || {})
  );
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

BackendAssistant.prototype.getEnvironment = function () {
  // return (process.env.FUNCTIONS_EMULATOR === true || process.env.FUNCTIONS_EMULATOR === 'true' || process.env.ENVIRONMENT !== 'production' ? 'development' : 'production')
  if (process.env.ENVIRONMENT === 'production') {
    return 'production';
  } else if (
    process.env.ENVIRONMENT === 'development'
    || process.env.FUNCTIONS_EMULATOR === true
    || process.env.FUNCTIONS_EMULATOR === 'true'
    || process.env.TERM_PROGRAM === 'Apple_Terminal'
    || process.env.TERM_PROGRAM === 'vscode'
  ) {
    return 'development';
  } else {
    return 'production'
  }
};

BackendAssistant.prototype.isDevelopment = function () {
  const self = this;

  return self.meta.environment === 'development';
}

BackendAssistant.prototype.isProduction = function () {
  const self = this;

  return self.meta.environment === 'production';
}

BackendAssistant.prototype.logProd = function () {
  const self = this;

  self._log.apply(self, args);
};

BackendAssistant.prototype.log = function () {
  const self = this;

  const args = Array.prototype.slice.call(arguments);

  self._log.apply(self, args);
};

BackendAssistant.prototype.error = function () {
  const self = this;

  const args = Array.prototype.slice.call(arguments);

  args.unshift('error');
  self.log.apply(self, args);
};

BackendAssistant.prototype.warn = function () {
  const self = this;

  const args = Array.prototype.slice.call(arguments);

  args.unshift('warn');
  self.log.apply(self, args);
};

BackendAssistant.prototype.info = function () {
  const self = this;

  const args = Array.prototype.slice.call(arguments);

  args.unshift('info');
  self.log.apply(self, args);
};

BackendAssistant.prototype.debug = function () {
  const self = this;

  const args = Array.prototype.slice.call(arguments);

  args.unshift('debug');
  self.log.apply(self, args);
};

BackendAssistant.prototype.notice = function () {
  const self = this;

  const args = Array.prototype.slice.call(arguments);

  args.unshift('notice');
  self.log.apply(self, args);
};

BackendAssistant.prototype.critical = function () {
  const self = this;

  const args = Array.prototype.slice.call(arguments);

  args.unshift('critical');
  self.log.apply(self, args);
};

BackendAssistant.prototype.emergency = function () {
  const self = this;

  const args = Array.prototype.slice.call(arguments);

  args.unshift('emergency');
  self.log.apply(self, args);
};

BackendAssistant.prototype._log = function () {
  const self = this;

  // 1. Convert args to a normal array
  const logs = [...Array.prototype.slice.call(arguments)];

  // 2. Prepend log prefix log string
  logs.unshift(`[${self.tag} @ ${new Date().toISOString()}]:`);

  // 3. Pass along arguments to console.log
  if (logs[1] === 'error') {
    logs.splice(1,1)
    console.error.apply(console, logs);
  } else if (logs[1] === 'warn') {
    logs.splice(1,1)
    console.warn.apply(console, logs);
  } else if (logs[1] === 'info') {
    logs.splice(1,1)
    console.info.apply(console, logs);
  } else if (logs[1] === 'debug') {
    logs.splice(1,1)
    console.debug.apply(console, logs);
  } else if (logs[1] === 'notice') {
    logs.splice(1,1)
    if (self.isDevelopment()) {
      console.log.apply(console, logs);
    } else {
      self.ref.functions.logger.write({
        severity: 'NOTICE',
        message: logs,
      });
    }
  } else if (logs[1] === 'critical') {
    logs.splice(1,1)
    if (isDevelopment) {
      console.log.apply(console, logs);
    } else {
      self.ref.functions.logger.write({
        severity: 'CRITICAL',
        message: logs,
      });
    }
  } else if (logs[1] === 'emergency') {
    logs.splice(1,1)
    if (isDevelopment) {
      console.log.apply(console, logs);
    } else {
      self.ref.functions.logger.write({
        severity: 'EMERGENCY',
        message: logs,
      });
    }
  } else if (logs[1] === 'log') {
    logs.splice(1,1)
    console.log.apply(console, logs);
  } else {
    console.log.apply(console, logs);
  }
}

BackendAssistant.prototype.getUser = function () {
  const self = this;

  return self?.usage?.user || self.request.user;
}

BackendAssistant.prototype.errorify = function (e, options) {
  const self = this;
  const res = self.ref.res;

  // Set options
  options = options || {};
  options.code = typeof options.code === 'undefined'
    ? 500
    : options.code;
  options.log = typeof options.log === 'undefined'
    ? true
    : options.log;
  options.sentry = typeof options.sentry === 'undefined'
    ? true
    : options.sentry;
  options.send = typeof options.send === 'undefined'
    ? true
    : options.send;
  options.stack = typeof options.stack === 'undefined'
    ? false
    : options.stack;

  // Construct error
  const newError = e instanceof Error
    ? e
    : new Error(stringify(e));

  // Fix code
  options.code = newError.code || options.code;
  options.code = isBetween(options.code, 400, 599) ? options.code : 500;

  // Attach properties
  _attachHeaderProperties(self, options, newError);

  // Log the error
  if (options.log) {
    self.error(newError);
  }

  // Send error to Sentry
  if (options.sentry) {
    self.Manager.libraries.sentry.captureException(newError);
  }

  // Quit and respond to the request
  if (options.send && res && res.status) {
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

    // Send response
    res
      .status(options.code)
      .send(sendable);
  }

  // return {
  //   error: newError,
  // }
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

  // Set options
  options = options || {};
  options.code = typeof options.code === 'undefined'
    ? 200
    : options.code;
  options.log = typeof options.log === 'undefined'
    ? true
    : options.log;

  // Handle error
  const isErrorCode = isBetween(options.code, 400, 599);
  if (
    response instanceof Error
    || isErrorCode
  ) {
    options.code = !isErrorCode ? undefined : options.code;
    return self.errorify(response, options);
  }

  // Attach properties
  _attachHeaderProperties(self, options);

  // Send response
  res.status(options.code);

  function _log(text) {
    if (options.log) {
      self.log(`${text} (${options.code}):`, JSON.stringify(response));
    }
  }

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
  if (response && typeof response === 'object') {
    return res.json(response);
  } else {
    return res.send(response);
  }
}

function isBetween(value, min, max) {
  return value >= min && value <= max;
}

function stringify(e) {
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
      current: self?.usage?.getUsage() || {},
      limits: self?.usage?.getLimit() || {},
    },
    additional: options.additional || {},
  }
  const req = self.ref.req;
  const res = self.ref.res;

  // Attach properties
  try {
    res.header('bm-properties', JSON.stringify(headers));
  } catch (e) {
    self.warn('Error attaching properties to header', e);
  }

  // Add bm-properties to Access-Control-Expose-Headers
  const existingExposed = res.get('Access-Control-Expose-Headers') || '';
  const newExposed = `${existingExposed}, bm-properties`.replace(/^, /, '');

  if (!existingExposed.match(/bm-properties/i)) {
    res.header('Access-Control-Expose-Headers', newExposed);
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

  let admin = self.ref.admin;
  let functions = self.ref.functions;
  let req = self.ref.req;
  let res = self.ref.res;
  let data = self.request.data;
  let idToken;

  options = options || {};
  options.resolve = typeof options.resolve === 'undefined' ? true : options.resolve;

  const logOptions = {environment: options.log ? 'production' : 'development'}

  function _resolve(user) {
    user = user || {};
    user.authenticated = typeof user.authenticated === 'undefined'
      ? false
      : user.authenticated;

    if (options.resolve) {
      self.request.user = self.resolveAccount(user);
      return self.request.user;
    } else {
      return user;
    }
  }

  if (req?.headers?.authorization && req?.headers?.authorization?.startsWith('Bearer ')) {
    // Read the ID Token from the Authorization header.
    idToken = req.headers.authorization.split('Bearer ')[1];
    self.log('Found "Authorization" header', idToken, logOptions);
  } else if (req?.cookies?.__session) {
    // Read the ID Token from cookie.
    idToken = req.cookies.__session;
    self.log('Found "__session" cookie', idToken, logOptions);
  } else if (data.backendManagerKey || data.authenticationToken) {
    // Check with custom BEM Token
    let storedApiKey;
    try {
      const workingConfig = _.get(self.Manager, 'config') || functions.config();
      storedApiKey = _.get(workingConfig, 'backend_manager.key', '')
    } catch (e) {

    }

    idToken = data.backendManagerKey || data.authenticationToken;

    self.log('Found "backendManagerKey" or "authenticationToken" parameter', {storedApiKey: storedApiKey, idToken: idToken}, logOptions);

    if (storedApiKey && (storedApiKey === data.backendManagerKey || storedApiKey === data.authenticationToken)) {
      self.request.user.authenticated = true;
      self.request.user.roles.admin = true;
      return _resolve(self.request.user);
    }
  } else if (options.apiKey) {
    self.log('Found "options.apiKey"', options.apiKey, logOptions);

    if (options.apiKey.includes('test')) {
      return _resolve(self.request.user);
    }

    await admin.firestore().collection(`users`)
      .where('api.privateKey', '==', options.apiKey)
      .get()
      .then(function(querySnapshot) {
        querySnapshot.forEach(function(doc) {
          self.request.user = doc.data();
          self.request.user.authenticated = true;
        });
      })
      .catch(function(error) {
        console.error('Error getting documents: ', error);
      });

    return _resolve(self.request.user);
  } else {
    // self.log('No Firebase ID token was able to be extracted.',
    //   'Make sure you authenticate your request by providing either the following HTTP header:',
    //   'Authorization: Bearer <Firebase ID Token>',
    //   'or by passing a "__session" cookie',
    //   'or by passing backendManagerKey or authenticationToken in the body or query', logOptions);

    return _resolve(self.request.user);
  }

  // Check with firebase
  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    if (options.debug) {
      self.log('Token correctly decoded', decodedIdToken.email, decodedIdToken.user_id, logOptions);
    }
    await admin.firestore().doc(`users/${decodedIdToken.user_id}`)
    .get()
    .then(async function (doc) {
      if (doc.exists) {
        self.request.user = Object.assign({}, self.request.user, doc.data());
      }
      self.request.user.authenticated = true;
      self.request.user.auth.uid = decodedIdToken.user_id;
      self.request.user.auth.email = decodedIdToken.email;
      if (options.debug) {
        self.log('Found user doc', self.request.user, logOptions)
      }
    })
    return _resolve(self.request.user);
  } catch (error) {
    self.error('Error while verifying Firebase ID token:', error, logOptions);
    return _resolve(self.request.user);
  }
};

BackendAssistant.prototype.resolveAccount = function (user) {
  const ResolveAccount = new (require('resolve-account'))();

  return ResolveAccount.resolve(undefined, user)
}

BackendAssistant.prototype.parseRepo = function (repo) {
  let repoSplit = repo.split('/');
  for (var i = 0; i < repoSplit.length; i++) {
    repoSplit[i] = repoSplit[i].replace('.git', '');
  }
  repoSplit = repoSplit.filter(function(value, index, arr){
      return value !== 'http:' &&
             value !== 'https:' &&
             value !== '' &&
             value !== 'github.com';
  });
  return {
    user: repoSplit[0],
    name: repoSplit[1],
  }
};

BackendAssistant.prototype.getHeaderIp = function (headers) {
  headers = headers || {};

  return (
    // these are present for cloudflare requests (11/21/2020)
    headers['cf-connecting-ip']
    || headers['fastly-temp-xff']

    // these are present for non-cloudflare requests (11/21/2020)
    || headers['x-appengine-user-ip']
    || headers['x-forwarded-for']

    // Not sure about these
    // || headers['fastly-client-ip']

    // If unsure, return local IP
    || '127.0.0.1'
  )
  .split(',')[0]
  .trim();
}

BackendAssistant.prototype.getHeaderContinent = function (headers) {
  headers = headers || {};

  return (
    // these are present for cloudflare requests (11/21/2020)
    headers['cf-ipcontinent']

    // If unsure, return ZZ
    || 'ZZ'
  )
  .split(',')[0]
  .trim();
}

BackendAssistant.prototype.getHeaderCountry = function (headers) {
  headers = headers || {};

  return (
    // these are present for cloudflare requests (11/21/2020)
    headers['cf-ipcountry']

    //
    || headers['x-country-code']

    // these are present for non-cloudflare requests (11/21/2020)
    || headers['x-appengine-country']

    // If unsure, return ZZ
    || 'ZZ'
  )
  .split(',')[0]
  .trim();
}

BackendAssistant.prototype.getHeaderRegion = function (headers) {
  headers = headers || {};

  return (
    // these are present for cloudflare requests (11/21/2020)
    headers['cf-region']

    // these are present for non-cloudflare requests (11/21/2020)
    || headers['x-appengine-region']

    // If unsure, return unknown
    || 'Unknown'
  )
  .split(',')[0]
  .trim();
}

BackendAssistant.prototype.getHeaderCity = function (headers) {
  headers = headers || {};

  return (
    // these are present for cloudflare requests (11/21/2020)
    headers['cf-ipcity']

    || headers['x-appengine-city']

    // If unsure, return unknown
    || 'Unknown'
  )
  .split(',')[0]
  .trim();
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

  return (
    headers['user-agent']
    || ''
  )
  .trim();
}

BackendAssistant.prototype.getHeaderLanguage = function (headers) {
  headers = headers || {};

  return (
    headers['accept-language']
    || headers['x-orig-accept-language']
    || ''
  )
  .trim();
}

BackendAssistant.prototype.getHeaderPlatform = function (headers) {
  headers = headers || {};

  return (
    headers['sec-ch-ua-platform']
    || ''
  )
  .replace(/"/ig, '')
  .trim();
}

BackendAssistant.prototype.getHeaderMobile = function (headers) {
  headers = headers || {};

  // Will be ?0 if fale or ?1 if true
  const mobile = (headers['sec-ch-ua-mobile'] || '').replace(/\?/ig, '');

  return mobile === '1' || mobile === true || mobile === 'true';
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
    // console.log('-----existingData', existingData, Object.keys(_.get(existingData, 'fields', {})).length, Object.keys(_.get(existingData, 'files', {})).length);
    if (Object.keys(_.get(existingData, 'fields', {})).length + Object.keys(_.get(existingData, 'files', {})).length > 0) {
      return resolve(existingData);
    }

    options = options || {};

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

function stringify(obj, replacer, spaces, cycleReplacer) {
  return JSON.stringify(obj, serializer(replacer, cycleReplacer), spaces)
}

// https://github.com/moll/json-stringify-safe/blob/master/stringify.js
function serializer(replacer, cycleReplacer) {
  var stack = [], keys = []

  if (cycleReplacer == null) cycleReplacer = function(key, value) {
    if (stack[0] === value) return '[Circular ~]'
    return `[Circular ~.${keys.slice(0, stack.indexOf(value)).join('.')}]`;
  }

  return function(key, value) {
    if (stack.length > 0) {
      var thisPos = stack.indexOf(this)
      ~thisPos ? stack.splice(thisPos + 1) : stack.push(this)
      ~thisPos ? keys.splice(thisPos, Infinity, key) : keys.push(key)
      if (~stack.indexOf(value)) value = cycleReplacer.call(this, key, value)
    }
    else stack.push(value)

    return replacer == null ? value : replacer.call(this, key, value)
  }
}

module.exports = BackendAssistant;
