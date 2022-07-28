// Libraries
const path = require('path');
const { get, merge } = require('lodash');
// const { debug, log, error, warn } = require('firebase-functions/lib/logger');
// let User;
// let Analytics;


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

  return self;
}

Manager.prototype.init = function (exporter, options) {
  const self = this;

  // Paths
  const core = './functions/core';
  const wrappers = './functions/wrappers';

  // Set options defaults
  options = options || {};
  options.initialize = typeof options.initialize === 'undefined' ? true : options.initialize;
  options.log = typeof options.log === 'undefined' ? false : options.log;
  options.setupFunctions = typeof options.setupFunctions === 'undefined' ? true : options.setupFunctions;
  options.setupFunctionsLegacy = typeof options.setupFunctionsLegacy === 'undefined' ? true : options.setupFunctionsLegacy;
  options.initializeLocalStorage = typeof options.initializeLocalStorage === 'undefined' ? false : options.initializeLocalStorage;
  options.sentry = typeof options.sentry === 'undefined' ? true : options.sentry;
  options.reportErrorsInDev = typeof options.reportErrorsInDev === 'undefined' ? false : options.reportErrorsInDev;
  options.firebaseConfig = options.firebaseConfig;
  options.useFirebaseLogger = typeof options.useFirebaseLogger === 'undefined' ? true : options.useFirebaseLogger;
  options.serviceAccountPath = typeof options.serviceAccountPath === 'undefined' ? 'service-account.json' : options.serviceAccountPath;
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
    Assistant: require('backend-assistant'),
    localDatabase: null,
    User: null,
    Analytics: null,
  };

  // Manager inner variables
  // self._inner = {
  //   ip: '',
  //   country: '',
  //   referrer: '',
  //   userAgent: '',
  // };

  // Set properties
  self.options = options;
  self.project = options.firebaseConfig || JSON.parse(process.env.FIREBASE_CONFIG);
  self.cwd = process.cwd();
  self.package = resolveProjectPackage();
  self.config = merge(
    require(path.resolve(self.cwd, 'backend-manager-config.json')),
    self.libraries.functions.config()
  );

  self.assistant = self.Assistant().init(undefined, options.assistant);

  process.env.ENVIRONMENT = !process.env.ENVIRONMENT ? self.assistant.meta.environment : process.env.ENVIRONMENT;

  // Use the working Firebase logger that they disabled for whatever reason
  if (self.assistant.meta.environment !== 'development' && options.useFirebaseLogger) {
    require('firebase-functions/lib/logger/compat');
  }

  if (options.log) {
    self.assistant.log('process.env', process.env, {environment: 'production'})
  }

  // Setup sentry
  if (self.options.sentry) {
    const sentryRelease = `${get(self.config, 'app.id') || self.project.projectId}@${self.package.version}`;
    const sentryDSN = get(self.config, 'sentry.dsn', '');
    // console.log('Sentry', sentryRelease, sentryDSN);

    self.libraries.sentry = require('@sentry/node');
    self.libraries.sentry.init({
      dsn: sentryDSN,
      release: sentryRelease,
      beforeSend(event, hint) {
        if (self.assistant.meta.environment === 'development' && !self.options.reportErrorsInDev) {
          self.assistant.error('Skipping Sentry because DEV')
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
    // console.log('Initializing:', self.project);
    // console.log('----process.env.GOOGLE_APPLICATION_CREDENTIALS', process.env.GOOGLE_APPLICATION_CREDENTIALS);
    try {
      // console.log('---process.env.GOOGLE_APPLICATION_CREDENTIALS', process.env.GOOGLE_APPLICATION_CREDENTIALS);
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        self.libraries.initializedAdmin = self.libraries.admin.initializeApp();
      } else {
        self.libraries.initializedAdmin = self.libraries.admin.initializeApp({
          credential: self.libraries.admin.credential.cert(
            require(path.resolve(self.cwd, options.serviceAccountPath))
          ),
          databaseURL: self.project.databaseURL,
        }, options.uniqueAppName);
      }
    } catch (e) {
      console.error('Failed to call .initializeApp()', e);
    }
    // admin.firestore().settings({/* your settings... */ timestampsInSnapshots: true})
  }

  // Main functions
  if (options.setupFunctions) {
    exporter.bm_api =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .https.onRequest(async (req, res) => {
      const Module = (new (require(`${core}/actions/api.js`))()).init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

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
          self.assistant.error(e, {environment: 'production'});
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
          self.assistant.error(e, {environment: 'production'});
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
          self.assistant.error(e, {environment: 'production'});
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
          self.assistant.error(e, {environment: 'production'});
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
          self.assistant.error(e, {environment: 'production'});
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
          self.assistant.error(e, {environment: 'production'});
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
          self.assistant.error(e, {environment: 'production'});
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
          self.assistant.error(e, {environment: 'production'});
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
          self.assistant.error(e, {environment: 'production'});
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
          self.assistant.error(e, {environment: 'production'});
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
          self.assistant.error(e, {environment: 'production'});
          return res.status(500).send(e.message);
        });
      });
    }

    // Events
    exporter.bm_authOnCreate =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .auth.user().onCreate(async (user) => {
      const Module = require(`${core}/events/auth/on-create.js`);
      Module.init(self, { user: user });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
      });
    });

    exporter.bm_authOnDelete =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .auth.user().onDelete(async (user) => {
      const Module = require(`${core}/events/auth/on-delete.js`);
      Module.init(self, { user: user });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
      });
    });

    exporter.bm_subOnWrite =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .firestore
    .document('notifications/subscriptions/all/{token}')
    .onWrite(async (change, context) => {
      const Module = require(`${core}/events/firestore/on-subscription.js`);
      Module.init(self, { change: change, context: context, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
      });
    });
  }

  // Set dotenv
  try {
    require('dotenv').config();
  } catch (e) {
    console.error('Failed to set up environment variables from .env file');
  }

  // Setup LocalDatabase
  if (options.initializeLocalStorage) {
    self.storage();
  }

  return self;
};

// HELPERS
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
  return new self.libraries.User(...arguments);
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

Manager.prototype.storage = function (options) {
  const self = this;
  options = options || {};
  options.name = options.name || 'main';

  if (!self._internal.storage[options.name]) {
    const low = require('lowdb');
    const FileSync = require('lowdb/adapters/FileSync');
    const dbPath = `./.data/${options.name}.json`;
    const adapter = new FileSync(dbPath);
    const jetpack = require('fs-jetpack');

    options.clearInvalid = typeof options.clearInvalid === 'undefined'
      ? true
      : options.clearInvalid;

    function _setup() {
      if (!jetpack.exists(dbPath)) {
        jetpack.write(dbPath, {});
      }
      self._internal.storage[options.name] = low(adapter);
    }

    try {
      _setup()
    } catch (e) {
      console.error(`Could not storage: ${dbPath}`, e);

      try {
        if (options.clearInvalid) {
          console.log(`Clearing invalud storage: ${dbPath}`);
          jetpack.write(dbPath, {});
        }
        _setup()
      } catch (e) {
        console.error(`Failed to clear invalid storage: ${dbPath}`, e);
      }
    }
  }

  return self._internal.storage[options.name]
};

// Manager.prototype.LocalDatabase = function () {
//   const self = this;
//   if (!self.libraries.LocalDatabase) {
//     const low = require('lowdb');
//     const FileSync = require('lowdb/adapters/FileSync');
//     // const dbPath = path.resolve(process.cwd(), './.data/db.json');
//     const dbPath = './.data/db.json';
//     const adapter = new FileSync(dbPath);
//     const jetpack = require('fs-jetpack');
//
//     try {
//       if (!jetpack.exists(dbPath)) {
//         jetpack.write(dbPath, {});
//       }
//       self.localDatabase = low(adapter);
//     } catch (e) {
//       console.error('Could not load .data', e);
//     }
//   }
//   self.libraries.LocalDatabase = self.libraries.LocalDatabase || require('./helpers/api-manager.js');
//   return new self.libraries.LocalDatabase(self, ...arguments);
// };

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

module.exports = Manager;
