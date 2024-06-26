// Libraries
const path = require('path');
const { get, merge } = require('lodash');
const jetpack = require('fs-jetpack');
const JSON5 = require('json5');
const EventEmitter = require('events');
// const EventEmitter = require('events').EventEmitter;
const util = require('util');

// const { debug, log, error, warn } = require('firebase-functions/lib/logger');
// let User;
// let Analytics;
// Paths
const core = './functions/core';
const wrappers = './functions/wrappers';

const BEM_CONFIG_TEMPLATE_PATH = path.resolve(__dirname, '../../templates/backend-manager-config.json');

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

  self.interface = {}

  // Setup EventEmitter
  EventEmitter.call(self);

  // Return
  return self;
}

// Inherit from EventEmitter
util.inherits(Manager, EventEmitter);

Manager.prototype.init = function (exporter, options) {
  const self = this;

  // Set options defaults
  options = options || {};
  options.initialize = typeof options.initialize === 'undefined' ? true : options.initialize;
  options.log = typeof options.log === 'undefined' ? false : options.log;
  options.projectType = typeof options.projectType === 'undefined' ? 'firebase' : options.projectType; // firebase, custom
  options.routes = typeof options.routes === 'undefined' ? '/routes' : options.routes;
  options.schemas = typeof options.schemas === 'undefined' ? '/schemas' : options.schemas;
  options.setupFunctions = typeof options.setupFunctions === 'undefined' ? true : options.setupFunctions;
  options.setupFunctionsLegacy = typeof options.setupFunctionsLegacy === 'undefined' ? false : options.setupFunctionsLegacy;
  options.setupFunctionsIdentity = typeof options.setupFunctionsIdentity === 'undefined' ? true : options.setupFunctionsIdentity;
  options.setupServer = typeof options.setupServer === 'undefined' ? true : options.setupServer;
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
  options.cwd = typeof options.cwd === 'undefined' ? process.cwd() : options.cwd;
  options.projectPackageDirectory = typeof options.projectPackageDirectory === 'undefined' ? undefined : options.projectPackageDirectory;
  options.logSavePath = typeof options.logSavePath === 'undefined' ? false : options.logSavePath;
  // options.assistant.optionsLogString = options.assistant.optionsLogString || undefined;

  // Load libraries
  self.libraries = {
    // Third-party
    functions: options.projectType === 'firebase'
      ? require('firebase-functions')
      : null,
    admin: require('firebase-admin'),
    cors: require('cors')({ origin: true }),
    sentry: null,

    // First-party
    Assistant: require('./helpers/assistant.js'),
    localDatabase: null,
    User: null,
    Analytics: null,
    logger: null,
  };

  // Set properties
  self.cwd = options.cwd;
  self.rootDirectory = __dirname;

  // Set options
  self.options = options;
  self.project = options.firebaseConfig || JSON.parse(process.env.FIREBASE_CONFIG || '{}');
  self.project.resourceZone = options.resourceZone;
  self.project.serviceAccountPath = path.resolve(self.cwd, options.serviceAccountPath);
  self.project.backendManagerConfigPath = path.resolve(self.cwd, options.backendManagerConfigPath);

  // Load package.json
  self.package = resolveProjectPackage(options.projectPackageDirectory || self.cwd);

  // Load config
  self.config = merge(
    // Load basic config
    merge({}, requireJSON5(BEM_CONFIG_TEMPLATE_PATH, true), requireJSON5(self.project.backendManagerConfigPath, true)),
    // Load ENV config as a fallback
    requireJSON5(path.resolve(self.cwd, '.runtimeconfig.json'), options.projectType === 'firebase'),
    // Finally, load the functions config
    self.libraries.functions
      ? self.libraries.functions.config()
      : {},
  );

  // Get app ID
  const appId = self.config?.app?.id;

  // Set log
  if (options.logSavePath) {
    self.libraries.logger = new (require('wonderful-log'))({
      console: {
        enabled: false,
      },
      file: {
        enabled: true,
        path: options.logSavePath,
      },
    });
  }

  // Init assistant
  self.assistant = self.Assistant().init({
    req: null,
    res: null,
    admin: self.libraries.admin,
    functions: self.libraries.functions,
    Manager: self,
  }, options.assistant);

  // Set more properties (need to wait for assistant to determine if DEV)
  self.project.functionsUrl = self.assistant.isDevelopment()
    ? `http://localhost:5001/${self.project.projectId}/${self.project.resourceZone}`
    : `https://${self.project.resourceZone}-${self.project.projectId}.cloudfunctions.net`;

  // Set environment
  process.env.ENVIRONMENT = !process.env.ENVIRONMENT
    ? self.assistant.meta.environment
    : process.env.ENVIRONMENT;

  // Use the working Firebase logger that they disabled for whatever reason
  if (
    process.env.GCLOUD_PROJECT
    && self.assistant.meta.environment !== 'development'
    && options.useFirebaseLogger
  ) {
    // require('firebase-functions/lib/logger/compat'); // Old way
    require('firebase-functions/logger/compat'); // firebase-functions@4 and above?
  }

  // Handle dev environments
  if (self.assistant.isDevelopment()) {
    const semverMajor = require('semver/functions/major')
    const semverCoerce = require('semver/functions/coerce')
    const semverUsing = semverMajor(semverCoerce(process.versions.node));
    const semverRequired = semverMajor(semverCoerce(self.package?.engines?.node || '0.0.0'));

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
    self.assistant.warn('⚠️ Missing config.app.id');
  }

  // Setup sentry
  if (self.options.sentry) {
    const sentryRelease = `${appId || self.project.projectId}@${self.package.version}`;
    const sentryDSN = self.config?.sentry?.dsn || '';
    // self.assistant.log('Sentry', sentryRelease, sentryDSN);

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
      // Initialize Firebase
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        self.libraries.initializedAdmin = self.libraries.admin.initializeApp();
        // self.app = self.libraries.initializedAdmin;
      } else {
        const serviceAccount = require(self.project.serviceAccountPath);
        self.libraries.initializedAdmin = self.libraries.admin.initializeApp({
          credential: self.libraries.admin.credential.cert(serviceAccount),
          databaseURL: self.project.databaseURL || `https://${self.project.projectId}.firebaseio.com`,
        }, options.uniqueAppName);
        // self.app = self.libraries.initializedAdmin;

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

  // Setup main functions
  if (options.projectType === 'firebase' && options.setupFunctions) {
    self.setupFunctions(exporter, options);
  }

  // Setup custom server
  if (options.projectType === 'custom' && options.setupServer) {
    self.setupCustomServer(exporter, options);
  }

  // Set dotenv
  try {
    const env = require('dotenv').config();
  } catch (e) {
    self.assistant.error(new Error(`Failed to set up environment variables from .env file: ${e.message}`));
  }

  // Setup LocalDatabase
  if (options.initializeLocalStorage) {
    self.storage();
  }

  // Fetch stats
  if (self.assistant.isDevelopment() && options.fetchStats) {
    setTimeout(function () {
      self.assistant.log('Fetching meta/stats...');
      self.libraries.admin
      .firestore().doc('meta/stats')
      .get()
      .then(doc => {
        self.assistant.log('meta/stats', doc.data());
      })
    }, 100);
  }

  // Send analytics
  self.Analytics({
    assistant: self.assistant,
    uuid: self.SERVER_UUID,
  })
  .event({
    name: 'admin/initialized',
    params: {
      // screen_class: 'MainActivity',
    },
  });

  // Return
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
        mod.assistant.respond(e, {code: 500, sentry: true});
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

  // Set options defaults
  ref = ref || {};
  options = options || {};

  // Create assistant instance
  return (new self.libraries.Assistant()).init({
    req: ref.req,
    res: ref.res,
    admin: self.libraries.admin,
    functions: self.libraries.functions,
    Manager: self,
  }, options)
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

    // Set path
    const subfolder = `storage/${self.options.uniqueAppName || 'primary'}/${options.name}`;

    // Setup lowdb
    const low = require('lowdb');
    const FileSync = require('lowdb/adapters/FileSync');
    const location = options.temporary
      ? `${require('os').tmpdir()}/${subfolder}.json`
      : `./.data/${subfolder}.json`;
    const adapter = new FileSync(location);

    // Log
    if (options.log) {
      self.assistant.log('storage(): Location', location);
    }

    // Clear temporary storage
    if (
      options.temporary
      && self.assistant.isDevelopment()
      && options.clear
    ) {
      self.assistant.log('Removed temporary file @', location);
      jetpack.remove(location);
    }

    // Setup options
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

Manager.prototype.getCustomServer = function () {
  const self = this;

  if (!self._internal.server || !self._internal.app) {
    throw new Error('Server not set up');
  }

  return {
    server: self._internal.server,
    app: self._internal.app,
  };
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

// Setup functions
Manager.prototype.setupFunctions = function (exporter, options) {
  const self = this;

  // Log
  if (options.log) {
    self.assistant.log('Setting up Firebase functions...');
  }

  // Setup functions
  exporter.bm_api =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60 * 5})
  // TODO: Replace this with new API
  .https.onRequest(async (req, res) => self._process((new (require(`${core}/actions/api.js`))()).init(self, { req: req, res: res, })));

  // Setup legacy functions
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

  // Setup identity functions
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

  // Setup events
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

  // Setup cron jobs
  exporter.bm_cronDaily =
  self.libraries.functions
  .runWith({ memory: '256MB', timeoutSeconds: 60 * 5})
  .pubsub.schedule('every 24 hours')
  .onRun(async (context) => self._process((new (require(`${core}/cron/daily.js`))()).init(self, { context: context, })));
};

// Setup Custom Server
Manager.prototype.setupCustomServer = function (_library, options) {
  const self = this;

  // Require
  const glob = require('glob').globSync;

  // Log
  if (options.log) {
    self.assistant.log('Setting up custom server...');
  }

  // Setup fastify
  // const app = library({
  //   logger: true,
  //   // querystringParser: str => querystring.parse(str.toLowerCase())
  // });

  // Setup express
  const app = require('express')({
    logger: true,
    // querystringParser: str => querystring.parse(str.toLowerCase())
  });

  // Setup body parser
  app.use(require('body-parser').json());

  // Designate paths
  const managerRoutesPath = path.normalize(`${__dirname}/routes`);
  const managerSchemasPath = path.normalize(`${__dirname}/schemas`);
  const customRoutesPath = path.normalize(`${self.cwd}${options.routes}`);
  const customSchemasPath = path.normalize(`${self.cwd}${options.schemas}`);

  // Create routes
  const routes = [];

  // Push function
  function _push(dir, isManager) {
    // Get all files
    glob('**/index.js', { cwd: dir })
    .forEach((file) => {
      // Build the item
      const item = {
        name: file.replace('/index.js', ''),
        namespace: file,
        path: path.resolve(dir, file),
        dir: dir,
        isManager: isManager,
      }

      // If it exists in routes, replace it
      const existing = routes.findIndex(r => r.name === item.name);
      if (existing > -1) {
        routes[existing] = item;
        return;
      }

      // Otherwise, push it
      routes.push(item);
    });
  }

  // Push routes
  // _push(`${__dirname}/routes`)
  _push(managerRoutesPath, true)
  _push(customRoutesPath, false)

  // Log routes
  // if (options.log) {
  //   self.assistant.log('Routes:', routes);
  // }

  // Install process
  routes.forEach((file) => {
    // self.assistant.log('---file', file);
    // Require the file
    const cors = self.libraries.cors;

    // Log
    if (options.log) {
      self.assistant.log(`Initializing route: ${file.name} @ ${file.path}`);
    }

    // Register the route
    app.all(`/${file.name}`, async (req, res) => {
      return cors(req, res, async () => {
        // self.Middleware(req, res).run(file.name, {schema: file.name})
        self.Middleware(req, res).run(file.name, {
          schema: file.name,
          routesDir: file.isManager ? managerRoutesPath : customRoutesPath,
          schemasDir: file.isManager ? managerSchemasPath : customSchemasPath,
        })
      });
    })

    // app.all(`/${name}`, async (req, res) => {
    //   return cors(req, res, async () => {
    //     // Fix req/res
    //     req.body = req.body || {};
    //     req.query = Object.assign({}, req.query || {});

    //     // Manager.Middleware(req, res).run('tools/screenshot', {schema: 'screenshot'})
    //     const handler = new (require(file.path))();
    //     const assistant = self.Assistant({req: req, res: res}, {functionName: name, functionType: 'http'});
    //     // const apiUser = await ApiManager.getUser(assistant);

    //     // Set handler properties
    //     handler.Manager = self;
    //     handler.assistant = assistant;
    //     handler.apiUser = null;

    //     // Log
    //     if (options.log) {
    //       self.assistant.log(`[Request] ${name} @ ${filepath}`, req.body, req.query);
    //     }

    //     // Execute the route
    //     try {
    //       await handler.process(req, res);
    //     } catch (e) {
    //       assistant.respond(e, {code: e.code});
    //     }
    //   });
    // })
  });

  // Run the server!
  const server = app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, () => {
    const address = server.address();

    // Check if there's an error
    if (server.address() === null) {
      self.assistant.error(e);
      process.exit(1);
    }

    // Log
    if (options.log) {
      self.assistant.log(`Server listening on ${address.address}:${address.port}`);
    }

    // Set server and app to internal
    self._internal.server = server;
    self._internal.app = app;

    // Emit event
    self.emit('online', new Event('online'), server, app);
  });
}

// Setup Custom Server
Manager.prototype.getApp = function (id) {
  const self = this;

  // Get the app
  return new Promise(function(resolve, reject) {
    const fetch = require('wonderful-fetch');

    // Set ID
    id = id || self.config.app.id;

    // If no ID, reject
    if (!id) {
      return reject(new Error('No ID provided'));
    }

    // Fetch the app
    fetch(`https://us-central1-itw-creative-works.cloudfunctions.net/getApp`, {
      method: 'post',
      response: 'json',
      timeout: 30000,
      tries: 3,
      body: {
        id: id,
      }
    })
    .then((r) => resolve(r))
    .catch((e) => reject(e));
  });
}

function resolveProjectPackage(dir) {
  try {
    return require(path.resolve(dir, 'functions', 'package.json'));
  } catch (e) {}

  try {
    return require(path.resolve(dir, 'package.json'));
  } catch (e) {}
}

function requireJSON5(file, throwError) {
  // Set throwError
  throwError = typeof throwError === 'undefined' ? true : throwError;

  // Load JSON5
  try {
    return JSON5.parse(jetpack.read(file))
  } catch (e) {
    // If we're not throwing an error, just return
    if (!throwError) {
      return {};
    }

    // Otherwise, throw the error
    console.error(`Failed to load JSON at ${file}:`, e);
    throw e;
  }
}

module.exports = Manager;
