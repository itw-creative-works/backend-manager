// Libraries
const path = require('path');
const merge = require('lodash/merge');
// const { debug, log, error, warn } = require('firebase-functions/lib/logger');
// let User;
// let Analytics;


function Manager(exporter, options) {
  // Constants
  this.SERVER_UUID = '11111111-1111-1111-1111-111111111111';

  // Modable
  this.libraries = {};
  this.handlers = {};
  return this;
}

Manager.prototype.init = function (exporter, options) {
  const self = this;

  // Paths
  const core = './functions/core';
  const test = './functions/test';
  const wrappers = './functions/wrappers';

  // Set options defaults
  options = options || {};
  options.initialize = typeof options.initialize === 'undefined' ? true : options.initialize;
  options.setupFunctions = typeof options.setupFunctions === 'undefined' ? true : options.setupFunctions;
  options.sentry = typeof options.sentry === 'undefined' ? true : options.sentry;
  options.firebaseConfig = options.firebaseConfig;
  options.useFirebaseLogger = typeof options.useFirebaseLogger === 'undefined' ? true : options.useFirebaseLogger;

  // Load libraries
  self.libraries = {
    functions: require('firebase-functions'),
    admin: require('firebase-admin'),
    cors: require('cors')({ origin: true }),
    Assistant: require('backend-assistant'),
    sentry: null,
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
  self.package = require(path.resolve(self.cwd, 'package.json'));
  self.config = merge(
    require(path.resolve(self.cwd, 'backend-manager-config.json')),
    self.libraries.functions.config()
  );

  self.assistant = self.Assistant().init();

  // Use the working Firebase logger that they disabled for whatever reason
  if (self.assistant.meta.environment !== 'development' && options.useFirebaseLogger) {
    require('firebase-functions/lib/logger/compat');
  }

  // Setup options features
  if (self.options.initialize) {
    // console.log('Initializing:', self.project);
    try {
      self.libraries.admin.initializeApp({
        credential: self.libraries.admin.credential.cert(
          require(path.resolve(self.cwd, 'service-account.json'))
        ),
        databaseURL: self.project.databaseURL,
      });
    } catch (e) {
      console.error('Failed to call .initializeApp()', e);
    }
    // admin.firestore().settings({/* your settings... */ timestampsInSnapshots: true})
  }

  if (self.options.sentry && self.config.sentry && self.config.sentry.dsn) {
    // console.log('Setting up sentry:', `${self.project.projectId}@${self.package.version}`);
    // console.log('self.config.sentry.dsn', self.config.sentry.dsn);
    self.libraries.sentry = require('@sentry/node');
    self.libraries.sentry.init({
      dsn: self.config.sentry.dsn,
      release: `${self.project.projectId}@${self.package.version}`,
      beforeSend(event, hint) {
        if (self.assistant.meta.environment === 'development') {
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

  // Main functions
  if (options.setupFunctions) {
    exporter.bm_api =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .https.onRequest(async (req, res) => {
      const Module = require(`${core}/actions/api.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

    exporter.bm_deleteUser =
    self.libraries.functions
    .runWith({memory: '256MB', timeoutSeconds: 60})
    .https.onRequest(async (req, res) => {
      const Module = require(`${core}/actions/delete-user.js`);
      Module.init(self, { req: req, res: res, });

      return self._preProcess(Module)
      .then(r => Module.main())
      .catch(e => {
        self.assistant.error(e, {environment: 'production'});
        return res.status(500).send(e.message);
      });
    });

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

  // Set dotenv
  // if (self.assistant.meta.environment === 'development') {
    try {
      require('dotenv').config();
    } catch (e) {
      console.error('Failed to set up environemtn variables from .env file');
    }
  // }

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
  this.libraries.User = this.libraries.User || require('./helpers/user.js');
  return new this.libraries.User(...arguments);
};

Manager.prototype.Analytics = function () {
  const self = this;
  this.libraries.Analytics = this.libraries.Analytics || require('./helpers/analytics.js');
  return new this.libraries.Analytics(self, ...arguments);
};

Manager.ApiManager = function () {
  const self = this;
  this.libraries.ApiManager = this.libraries.ApiManager || require('./helpers/api-manager.js');
  return new this.libraries.ApiManager(self, ...arguments);
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

module.exports = Manager;
