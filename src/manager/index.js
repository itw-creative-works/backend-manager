// Libraries
const path = require('path');
const { get, merge } = require('lodash');
const jetpack = require('fs-jetpack');
const JSON5 = require('json5');

// const { debug, log, error, warn } = require('firebase-functions/lib/logger');
// let User;
// let Analytics;
// Paths
const core = './functions/core';
const wrappers = './functions/wrappers';

function Manager(exporter, options) {
  const self = this;
  // Constants
  self.SERVER_UUID = '11111111-1111-1111-1111-111111111111';

  // Modable
  self.libraries = {};
  self.handlers = {};

  self._internal = {
    storage: {},
  };

  // self.isDevelopment = false;

  return self;
}

Manager.prototype.init = function (exporter, options) {
  const self = this;

  // Set options defaults
  options = options || {};
  options.initialize = typeof options.initialize === 'undefined' ? true : options.initialize;
  options.log = typeof options.log === 'undefined' ? false : options.log;
  options.setupFunctions = typeof options.setupFunctions === 'undefined' ? true : options.setupFunctions;
  options.setupFunctionsLegacy = typeof options.setupFunctionsLegacy === 'undefined' ? false : options.setupFunctionsLegacy;
  options.setupFunctionsIdentity = typeof options.setupFunctionsIdentity === 'undefined' ? true : options.setupFunctionsIdentity;
  options.initializeLocalStorage = typeof options.initializeLocalStorage === 'undefined' ? false : options.initializeLocalStorage;
  options.resourceZone = typeof options.resourceZone === 'undefined' ? 'us-central1' : options.resourceZone;
  options.sentry = typeof options.sentry === 'undefined' ? true : options.sentry;
  options.reportErrorsInDev = typeof options.reportErrorsInDev === 'undefined' ? false : options.reportErrorsInDev;
  options.firebaseConfig = options.firebaseConfig;
  options.useFirebaseLogger = typeof options.useFirebaseLogger === 'undefined' ? true : options.useFirebaseLogger;
  options.serviceAccountPath = typeof options.serviceAccountPath === 'undefined' ? 'service-account.json' : options.serviceAccountPath;
  options.backendManagerConfigPath = typeof options.backendManagerConfigPath === 'undefined' ? 'backend-manager-config.json' : options.backendManagerConfigPath;
  options.fetchStats = typeof options.fetchStats === 'undefined' ? true : options.fetchStats;
  options.checkNodeVersion = typeof options.checkNodeVersion === 'undefined' ? true : options.checkNodeVersion;
  options.uniqueAppName = options.uniqueAppName || undefined;
  options.assistant = options.assistant || {};
  // options.assistant.optionsLogString = options.assistant.optionsLogString || undefined;

  // Load libraries
  self.libraries = {
    // Third-party
    functions: require('firebase-functions'),
    admin: require('firebase-admin'),
    cors: require('cors')({ origin: true }),
    sentry: null,

    // First-party
    Assistant: require('./helpers/assistant.js'),
    localDatabase: null,
    User: null,
    Analytics: null,
  };

  // Set properties
  self.cwd = process.cwd();

  self.options = options;
  self.project = options.firebaseConfig || JSON.parse(process.env.FIREBASE_CONFIG || '{}');
  self.project.resourceZone = options.resourceZone;
  self.project.serviceAccountPath = path.resolve(self.cwd, options.serviceAccountPath);
  self.project.backendManagerConfigPath = path.resolve(self.cwd, options.backendManagerConfigPath);

  self.package = resolveProjectPackage();
  self.config = merge(
    requireJSON5(self.project.backendManagerConfigPath),
    self.libraries.functions.config()
  );

  // Saved config
  const appId = get(self.config, 'app.id');

  // Init assistant
  self.assistant = self.Assistant().init(undefined, options.assistant);

  // Set more properties (need to wait for assistant to determine if DEV)
  self.project.functionsUrl = self.assistant.isDevelopment()
    ? `http://localhost:5001/${self.project.projectId}/${self.project.resourceZone}`
    : `https://${self.project.resourceZone}-${self.project.projectId}.cloudfunctions.net`;

  process.env.ENVIRONMENT = !process.env.ENVIRONMENT ? self.assistant.meta.environment : process.env.ENVIRONMENT;

  // Use the working Firebase logger that they disabled for whatever reason
  if (process.env.GCLOUD_PROJECT && self.assistant.meta.environment !== 'development' && options.useFirebaseLogger) {
    // require('firebase-functions/lib/logger/compat'); // Old way
    require('firebase-functions/logger/compat'); // firebase-functions@4 and above?
  }

  // Handle dev environments
  if (self.assistant.isDevelopment()) {
    const semverMajor = require('semver/functions/major')
    const semverCoerce = require('semver/functions/coerce')
    const semverUsing = semverMajor(semverCoerce(process.versions.node));
    const semverRequired = semverMajor(semverCoerce(get(self.package, 'engines.node', '0.0.0')));

    // Fix firebase-tools overwriting console.log
    // https://stackoverflow.com/questions/56026747/firebase-console-log-on-localhost
    if (process.env.GCLOUD_PROJECT) {
      function logFix() {
        console.error(...arguments);
      }
      console.log = logFix;
      console.info = logFix;
    }

    // Reject if package.json does not exist
    if (semverUsing !== semverRequired) {
      const msg = `Node.js version mismatch: using ${semverUsing} but asked for ${semverRequired}`;
      if (options.checkNodeVersion) {
        self.assistant.error(new Error(msg));
        return process.exit(1);
      } else {
        self.assistant.log(msg);
      }
    }
  }

  if (options.log) {
    // self.assistant.log('process.env', process.env)
    self.assistant.log('Resolved serviceAccountPath', self.project.serviceAccountPath);
    self.assistant.log('Resolved backendManagerConfigPath', self.project.backendManagerConfigPath);
  }

  if (!appId) {
    console.warn('⚠️ Missing config.app.id');
  }

  // Setup sentry
  if (self.options.sentry) {
    const sentryRelease = `${appId || self.project.projectId}@${self.package.version}`;
    const sentryDSN = get(self.config, 'sentry.dsn', '');
    // console.log('Sentry', sentryRelease, sentryDSN);

    self.libraries.sentry = require('@sentry/node');
    self.libraries.sentry.init({
      dsn: sentryDSN,
      release: sentryRelease,
      beforeSend(event, hint) {
        if (self.assistant.isDevelopment() && !self.options.reportErrorsInDev) {
          self.assistant.error(new Error('[Sentry] Skipping Sentry because we\'re in development'), hint)
          return null;
        }
        event.tags = event.tags || {};
        event.tags['function.name'] = self.assistant.meta.name;
        event.tags['function.type'] = self.assistant.meta.type;
        event.tags['environment'] = self.assistant.meta.environment;
        return event;
      },
    });
  }

  // Setup options features
  if (self.options.initialize) {
    // Initialize Firebase
    try {
      // console.log('---process.env.GOOGLE_APPLICATION_CREDENTIALS', process.env.GOOGLE_APPLICATION_CREDENTIALS);
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        self.libraries.initializedAdmin = self.libraries.admin.initializeApp();
      } else {
        const serviceAccount = require(self.project.serviceAccountPath);
        self.libraries.initializedAdmin = self.libraries.admin.initializeApp({
          credential: self.libraries.admin.credential.cert(serviceAccount),
          databaseURL: self.project.databaseURL || `https://${self.project.projectId}.firebaseio.com`,
        }, options.uniqueAppName);

        // const loadedProjectId = get(self.libraries.initializedAdmin, 'options_.credential.projectId', null);
        const loadedProjectId = serviceAccount.project_id;
        if (!loadedProjectId || !loadedProjectId.includes(appId)) {
          self.assistant.error(`Loaded app may have wrong service account: ${loadedProjectId} =/= ${appId}`);
        }
      }

    } catch (e) {
      self.assistant.error('Failed to call .initializeApp()', e);
    }

    // Update firebase settings
    try {
      // Update project config
      self.libraries.admin.auth().projectConfigManager().updateProjectConfig({
        emailPrivacyConfig: {
          enableImprovedEmailPrivacy: true,
        },
      });
    } catch (e) {
      self.assistant.error('Failed to call .updateProjectConfig()', e);
    } finally {

    }
    // admin.firestore().settings({/* your settings... */ timestampsInSnapshots: true})
  }

  // Main functions
  if (options.setupFunctions) {
    exporter.bm_api =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    // TODO: Replace this with new API
    .https.onRequest(async (req, res) => self._process((new (require(`${core}/actions/api.js`))()).init(self, { req: req, res: res, })));

    if (options.setupFunctionsLegacy) {
      exporter.bm_signUpHandler =
      self.libraries.functions
      .runWith({memory: '256MB', timeoutSeconds: 60})
      .https.onRequest(async (req, res) => {
        const Module = require(`${core}/actions/sign-up-handler.js`);
        Module.init(self, { req: req, res: res, });

        return self._preProcess(Module)
        .then(r => Module.main())
        .catch(e => {
          self.assistant.error(e);
          return res.status(500).send(e.message);
        });
      });

      // Admin
      exporter.bm_createPost =
      self.libraries.functions
      .runWith({memory: '256MB', timeoutSeconds: 60})
      .https.onRequest(async (req, res) => {
        const Module = require(`${core}/admin/create-post.js`);
        Module.init(self, { req: req, res: res, });

        return self._preProcess(Module)
        .then(r => Module.main())
        .catch(e => {
          self.assistant.error(e);
          return res.status(500).send(e.message);
        });
      });

      exporter.bm_firestoreWrite =
      self.libraries.functions
      .runWith({memory: '256MB', timeoutSeconds: 60})
      .https.onRequest(async (req, res) => {
        const Module = require(`${core}/admin/firestore-write.js`);
        Module.init(self, { req: req, res: res, });

        return self._preProcess(Module)
        .then(r => Module.main())
        .catch(e => {
          self.assistant.error(e);
          return res.status(500).send(e.message);
        });
      });

      exporter.bm_getStats =
      self.libraries.functions
      .runWith({memory: '256MB', timeoutSeconds: 420})
      .https.onRequest(async (req, res) => {
        const Module = require(`${core}/admin/get-stats.js`);
        Module.init(self, { req: req, res: res, });

        return self._preProcess(Module)
        .then(r => Module.main())
        .catch(e => {
          self.assistant.error(e);
          return res.status(500).send(e.message);
        });
      });

      exporter.bm_sendNotification =
      self.libraries.functions
      .runWith({memory: '1GB', timeoutSeconds: 420})
      .https.onRequest(async (req, res) => {
        const Module = require(`${core}/admin/send-notification.js`);
        Module.init(self, { req: req, res: res, });

        return self._preProcess(Module)
        .then(r => Module.main())
        .catch(e => {
          self.assistant.error(e);
          return res.status(500).send(e.message);
        });
      });

      exporter.bm_query =
      self.libraries.functions
      .runWith({memory: '256MB', timeoutSeconds: 60})
      .https.onRequest(async (req, res) => {
        const Module = require(`${core}/admin/query.js`);
        Module.init(self, { req: req, res: res, });

        return self._preProcess(Module)
        .then(r => Module.main())
        .catch(e => {
          self.assistant.error(e);
          return res.status(500).send(e.message);
        });
      });

      exporter.bm_createPostHandler =
      self.libraries.functions
      .runWith({memory: '256MB', timeoutSeconds: 60})
      .https.onRequest(async (req, res) => {
        const Module = require(`${core}/actions/create-post-handler.js`);
        Module.init(self, { req: req, res: res, });

        return self._preProcess(Module)
        .then(r => Module.main())
        .catch(e => {
          self.assistant.error(e);
          return res.status(500).send(e.message);
        });
      });

      exporter.bm_generateUuid =
      self.libraries.functions
      .runWith({memory: '256MB', timeoutSeconds: 60})
      .https.onRequest(async (req, res) => {
        const Module = require(`${core}/actions/generate-uuid.js`);
        Module.init(self, { req: req, res: res, });

        return self._preProcess(Module)
        .then(r => Module.main())
        .catch(e => {
          self.assistant.error(e);
          return res.status(500).send(e.message);
        });
      });

      // Test
      exporter.bm_test_authenticate =
      self.libraries.functions
      .runWith({memory: '256MB', timeoutSeconds: 60})
      .https.onRequest(async (req, res) => {
        const Module = require(`${test}/authenticate.js`);
        Module.init(self, { req: req, res: res, });

        return self._preProcess(Module)
        .then(r => Module.main())
        .catch(e => {
          self.assistant.error(e);
          return res.status(500).send(e.message);
        });
      });

      exporter.bm_test_createTestAccounts =
      self.libraries.functions
      .runWith({memory: '256MB', timeoutSeconds: 60})
      .https.onRequest(async (req, res) => {
        const Module = require(`${test}/create-test-accounts.js`);
        Module.init(self, { req: req, res: res, });

        return self._preProcess(Module)
        .then(r => Module.main())
        .catch(e => {
          self.assistant.error(e);
          return res.status(500).send(e.message);
        });
      });

      exporter.bm_test_webhook =
      self.libraries.functions
      .runWith({memory: '256MB', timeoutSeconds: 60})
      .https.onRequest(async (req, res) => {
        const Module = require(`${test}/webhook.js`);
        Module.init(self, { req: req, res: res, });

        return self._preProcess(Module)
        .then(r => Module.main())
        .catch(e => {
          self.assistant.error(e);
          return res.status(500).send(e.message);
        });
      });
    }

    // Events
    if (options.setupFunctionsIdentity) {
      exporter.bm_authBeforeCreate =
      self.libraries.functions
      .runWith({memory: '256MB', timeoutSeconds: 60})
      .auth.user()
      .beforeCreate(async (user, context) => self._process((new (require(`${core}/events/auth/before-create.js`))()).init(self, { user: user, context: context})));

      exporter.bm_authBeforeSignIn =
      self.libraries.functions
      .runWith({memory: '256MB', timeoutSeconds: 60})
      .auth.user()
      .beforeSignIn(async (user, context) => self._process((new (require(`${core}/events/auth/before-signin.js`))()).init(self, { user: user, context: context})));
    }

    exporter.bm_authOnCreate =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .auth.user()
    .onCreate(async (user, context) => self._process((new (require(`${core}/events/auth/on-create.js`))()).init(self, { user: user, context: context})));

    exporter.bm_authOnDelete =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .auth.user()
    .onDelete(async (user, context) => self._process((new (require(`${core}/events/auth/on-delete.js`))()).init(self, { user: user, context: context})));

    exporter.bm_subOnWrite =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .firestore.document('notifications/subscriptions/all/{token}')
    .onWrite(async (change, context) => self._process((new (require(`${core}/events/firestore/on-subscription.js`))()).init(self, { change: change, context: context, })));

    // Cron
    exporter.bm_cronDaily =
    self.libraries.functions
    .runWith({ memory: '256MB', timeoutSeconds: 120 })
    .pubsub.schedule('every 24 hours')
    .onRun(async (context) => self._process((new (require(`${core}/cron/daily.js`))()).init(self, { context: context, })));
  }

  // Set dotenv
  try {
    require('dotenv').config();
  } catch (e) {
    self.assistant.error(new Error('Failed to set up environment variables from .env file'));
  }

  // Setup LocalDatabase
  if (options.initializeLocalStorage) {
    self.storage();
  }

  if (self.assistant.isDevelopment() && options.fetchStats) {
    setTimeout(function () {
      self.assistant.log('Fetching meta/stats...');
      self.libraries.admin
      .firestore().doc('meta/stats')
      .get()
      .then(doc => {
        self.assistant.log('meta/stats', doc.data());
      })
    }, 3000);
  }

  return self;
};

// HELPERS
Manager.prototype._process = function (mod, options) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const name = mod.assistant.meta.name;
    const hook = self.handlers && self.handlers[name];
    const req = mod.req;
    const res = mod.res;
    let error;

    function _reject(e, log) {
      if (log) {
        // self.assistant.error(e);
        mod.assistant.errorify(e, {code: 500, sentry: true, send: false, log: true});
      }
      // res.status(500).send(e.message);
      return resolve()
    }

    // Run pre
    if (hook) {
      await hook(mod, 'pre').catch(e => {error = e});
    }
    if (error) { return _reject(error, true) }

    // Run main
    await mod.main().catch(e => {error = e});
    if (error) { return _reject(error, false) }

    // Run post
    if (hook) {
      await hook(mod, 'post').catch(e => {error = e});
    }
    if (error) { return _reject(error, true) }

    // Fin
    return resolve();
  });
};

Manager.prototype._preProcess = function (mod) {
  const self = this;
  const name = mod.assistant.meta.name;
  return new Promise(async function(resolve, reject) {
    if (self.handlers && self.handlers[name]) {
      let result;
      try {
        result = self.handlers[name](mod)
      } catch (e) {
        mod.assistant.error(e);
        return reject(e);
      }
      if (Promise.resolve(result) == result) {
        result
        .then(r => {
          return resolve(r);
        })
        .catch(e => {
          mod.assistant.error(e);
          return reject(e);
        })
      } else {
        return resolve(result);
      }
    } else {
      return resolve(null);
    }
  });
};

// Manager.prototype.Assistant = function(ref, options) {
//   const self = this;
//   ref = ref || {};
//   options = options || {};
//   return (new self.libraries.Assistant()).init({
//     req: ref.req,
//     res: ref.res,
//     admin: self.libraries.admin,
//     functions: self.libraries.functions,
//   }, {
//     accept: options.accept,
//   })
// };

Manager.prototype.Assistant = function(ref, options) {
  const self = this;
  ref = ref || {};
  options = options || {};
  return (new self.libraries.Assistant()).init({
    req: ref.req,
    res: ref.res,
    admin: self.libraries.admin,
    functions: self.libraries.functions,
    Manager: self,
  }, options)
  // return (new self.libraries.Assistant()).init({
  //   req: ref.req,
  //   res: ref.res,
  //   admin: self.libraries.admin,
  //   functions: self.libraries.functions,
  //   Manager: self,
  // }, {
  //   accept: options.accept,
  //   functionName: options.functionName,
  //   functionType: options.functionType,
  // })
  // self._inner.ip = (!self._inner.ip || self._inner.ip === '127.0.0.1') ? ass.request.ip : self._inner.ip;
  // self._inner.country = self._inner.country || ass.request.country;
  // self._inner.referrer = self._inner.referrer || ass.request.referrer;
  // self._inner.userAgent = (!self._inner.userAgent || self._inner.userAgent === 'empty') ? ass.request.userAgent : self._inner.userAgent;
  // self._inner.name = self._inner.name || ass.meta.name;
  // if (ref.req) {
  //   console.log('ref.req.headers', ref.req.headers);
  // }
  // console.log('self._inner', self._inner);
};

Manager.prototype.User = function () {
  const self = this;
  self.libraries.User = self.libraries.User || require('./helpers/user.js');
  return new self.libraries.User(self, ...arguments);
};

Manager.prototype.Analytics = function () {
  const self = this;
  self.libraries.Analytics = self.libraries.Analytics || require('./helpers/analytics.js');
  return new self.libraries.Analytics(self, ...arguments);
};

Manager.prototype.ApiManager = function () {
  const self = this;
  self.libraries.ApiManager = self.libraries.ApiManager || require('./helpers/api-manager.js');
  return new self.libraries.ApiManager(self, ...arguments);
};

Manager.prototype.Roles = function () {
  const self = this;
  self.libraries.Roles = self.libraries.Roles || require('./helpers/roles.js');
  return new self.libraries.Roles(self, ...arguments);
};

Manager.prototype.SubscriptionResolver = function () {
  const self = this;
  self.libraries.SubscriptionResolver = self.libraries.SubscriptionResolver || require('./helpers/subscription-resolver.js');
  return new self.libraries.SubscriptionResolver(self, ...arguments);
};

Manager.prototype.Usage = function () {
  const self = this;
  self.libraries.Usage = self.libraries.Usage || require('./helpers/usage.js');
  return new self.libraries.Usage(self, ...arguments);
};

Manager.prototype.Middleware = function () {
  const self = this;
  self.libraries.Middleware = self.libraries.Middleware || require('./helpers/middleware.js');
  return new self.libraries.Middleware(self, ...arguments);
};

Manager.prototype.Settings = function () {
  const self = this;
  self.libraries.Settings = self.libraries.Settings || require('./helpers/settings.js');
  return new self.libraries.Settings(self, ...arguments);
};

Manager.prototype.Metadata = function () {
  const self = this;
  self.libraries.Metadata = self.libraries.Metadata || require('./helpers/metadata.js');
  return new self.libraries.Metadata(self, ...arguments);
};

// For importing API libraries
Manager.prototype.Api = function () {
  const self = this;
  // self.libraries.Api = self.libraries.Api || require('./helpers/subscription-resolver.js');
  // return new self.libraries.Api(...arguments);
  // return self._process((new (require(`${core}/actions/api.js`))()).init(self, { req: req, res: res, }))

  const Api = (new (require(`${core}/actions/api.js`))()).init(self, { req: {}, res: {}, });

  return Api;
};

// Manager.prototype.Api = function () {
//   const self = this;
//   // self.libraries.Api = self.libraries.Api || require('./helpers/subscription-resolver.js');
//   // return new self.libraries.Api(...arguments);
//   // return self._process((new (require(`${core}/actions/api.js`))()).init(self, { req: req, res: res, }))
//   return new Promise(function(resolve, reject) {
//     const Api = (new (require(`${core}/actions/api.js`))()).init(self, { req: {}, res: {}, });

//     Api.main()

//     return Api;
//   });
// };

// Manager.prototype.Utilities = function () {
//   const self = this;
//   self.libraries.Utilities = self.libraries.Utilities || require('./helpers/utilities.js');
//   return new self.libraries.Utilities(self, ...arguments);
// };

Manager.prototype.Utilities = function () {
  const self = this;

  if (!self._internal.utilities) {
    self.libraries.Utilities = require('./helpers/utilities.js');
    self._internal.utilities = new self.libraries.Utilities(self, ...arguments);
  }

  return self._internal.utilities;
};

Manager.prototype.storage = function (options) {
  const self = this;
  options = options || {};
  options.name = options.name || 'main';

  if (!self._internal.storage[options.name]) {
    options.temporary = typeof options.temporary === 'undefined' ? false : options.temporary;
    options.clear = typeof options.clear === 'undefined' ? true : options.clear;
    options.log = typeof options.log === 'undefined' ? false : options.log;

    const low = require('lowdb');
    const FileSync = require('lowdb/adapters/FileSync');
    const location = options.temporary
      ? `${require('os').tmpdir()}/storage/${options.name}.json`
      : `./.data/storage/${options.name}.json`;
    const adapter = new FileSync(location);

    if (options.log) {
      self.assistant.log('storage(): Location', location);
    }

    if (
      options.temporary
      && self.assistant.isDevelopment()
      && options.clear
    ) {
      self.assistant.log('Removed temporary file @', location);
      jetpack.remove(location);
    }

    options.clearInvalid = typeof options.clearInvalid === 'undefined'
      ? true
      : options.clearInvalid;

    function _setup() {
      if (!jetpack.exists(location)) {
        jetpack.write(location, {});
      }
      self._internal.storage[options.name] = low(adapter);

      self._internal.storage[options.name].set('_location', location)
    }

    try {
      _setup()
    } catch (e) {
      self.assistant.error(`Could not setup storage: ${location}`, e);

      try {
        if (options.clearInvalid) {
          self.assistant.log(`Clearing invalid storage: ${location}`);
          jetpack.write(location, {});
        }
        _setup()
      } catch (e) {
        self.assistant.error(`Failed to clear invalid storage: ${location}`, e);
      }
    }
  }

  return self._internal.storage[options.name]
};

Manager.prototype.install = function (controller, options) {
  const self = this;

  // Set options defaults
  options = options || {};
  options.prefix = typeof options.prefix === 'undefined' ? null : options.prefix;
  options.dir = typeof options.dir === 'undefined' ? '' : options.dir;
  options.log = typeof options.log === 'undefined' ? false : options.log;

  // Fix dir
  options.dir = path.resolve(self.cwd, options.dir);

  // If dir is a single file, install it. if its a directory, install all
  const isDirectory = jetpack.exists(options.dir) === 'dir';

  if (options.log) {
    self.assistant.log(`Installing from ${options.dir}, prefix=${options.prefix}, isDirectory=${isDirectory}...`);
  }

  function _install(prefix, file) {
    if (!file.includes('.js')) {return}
    const name = file.replace('.js', '');
    const _prefix = prefix ? `${prefix}_${name}` : name;

    const fullPath = path.resolve(options.dir, file);

    if (options.log) {
      self.assistant.log(`Installing ${_prefix} from ${fullPath}...`);
    }

    controller[`${_prefix}`] = require(fullPath);
  }

  if (isDirectory) {
    jetpack.list(options.dir)
    .forEach(file => _install(options.prefix, file))
  } else {
    _install(options.prefix, options.dir);
  }
};

Manager.prototype.require = function (p) {
  return require(p);
};

Manager.prototype.debug = function () {
  return {
    throwException: function () {
      throw new Error('TEST_ERROR');
    },
    throwRejection: function () {
      Promise.reject(new Error('TEST_ERROR'));
    }
  }
}

function resolveProjectPackage() {
  try {
    return require(path.resolve(process.cwd(), 'functions', 'package.json'));
  } catch (e) {}

  try {
    return require(path.resolve(process.cwd(), 'package.json'));
  } catch (e) {}
}

function requireJSON5(p) {
  try {
    return JSON5.parse(jetpack.read(p))
  } catch (e) {
    console.error(`Failed to load JSON at ${p}:`, e)
    throw e;
  }
}

module.exports = Manager;
