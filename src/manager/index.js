const path = require('path');
let User;
let Analytics;


function Manager(exporter, options) {
  this.libraries = {};
}

// Constants
Manager.SERVER_UUID = '11111111-1111-1111-1111-111111111111';

Manager.init = function (exporter, options) {
  let self = this;

  // Paths
  const core = './functions/core';
  const test = './functions/test';
  const wrappers = './functions/wrappers';

  // Varibles
  let assistant;

  // Set options defaults
  options = options || {};
  options.initialize = typeof options.initialize === 'undefined' ? true : options.initialize;
  options.sentry = typeof options.sentry === 'undefined' ? true : options.sentry;

  // Load libraries
  self.libraries = {
    functions: require('firebase-functions'),
    admin: require('firebase-admin'),
    cors: require('cors')({ origin: true }),
    Assistant: require('backend-assistant'),
    sentry: null,
  };

  // Set properties
  self.options = options;
  self.project = JSON.parse(process.env.FIREBASE_CONFIG)
  self.cwd = process.cwd();
  self.package = require(path.resolve(self.cwd, 'package.json'));
  self.config = self.libraries.functions.config() || {};

  assistant = new self.libraries.Assistant().init();

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
    self.libraries.sentry = require('@sentry/node');
    self.libraries.sentry.init({
      dsn: self.config.sentry.dsn,
      release: `${self.project.projectId}@${self.package.version}`,
      beforeSend(event, hint) {
        if (assistant.meta.environment === 'development') {
          assistant.error('Skipping Sentry because DEV')
          return null;
        }
        event.tags = event.tags || {};
        event.tags['function.name'] = assistant.meta.name;
        event.tags['function.type'] = assistant.meta.type;
        event.tags['environment'] = assistant.meta.environment;
        return event;
      },
    });
  }

  // Main functions
  exporter.bm_deleteUser =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/actions/delete-user.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

  exporter.bm_signUpHandler =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/actions/sign-up-handler.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

  // Admin
  exporter.bm_createPost =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/admin/create-post.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });
  exporter.bm_getStats =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 420})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/admin/get-stats.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });
  exporter.bm_sendNotification =
  self.libraries.functions
  .runWith({memory: '1GB', timeoutSeconds: 420})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/admin/send-notification.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });
  exporter.bm_query =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/admin/query.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

  // Events
  exporter.bm_authOnCreate =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .auth.user().onCreate(async (user) => {
    const Module = require(`${core}/events/auth/on-create.js`)
    Module.init(self, { user: user })
    return Module.main();
  });

  exporter.bm_authOnDelete =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .auth.user().onDelete(async (user) => {
    const Module = require(`${core}/events/auth/on-delete.js`)
    Module.init(self, { user: user })
    return Module.main();
  });

  exports.bm_subOnWrite =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .firestore
  .document('notifications/subscriptions/all/{token}')
  .onWrite((change, context) => {
    const Module = require(`${core}/events/firestore/on-subscription.js`)
    Module.init(self, { change: change, context: context, })
    return Module.main();
  });


  // Test
  exporter.bm_test_authenticate =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${test}/authenticate.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

  exporter.bm_test_createTestAccounts =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${test}/create-test-accounts.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

  exporter.bm_test_webhook =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${test}/webhook.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

};

Manager.Assistant = function (ref, options) {
  let self = this;
  ref = ref || {};
  options = options || {};
  return new self.libraries.Assistant().init(
    {
      req: ref.req,
      res: ref.res,
      admin: self.libraries.admin,
      functions: self.libraries.functions,
    },
    {
      accept: options.accept,
    })
};

Manager.User = function (options) {
  User = User || require('./helpers/user.js');
  return new User(options);
};

Manager.Analytics = function (options) {
  Analytics = Analytics || require('./helpers/analytics.js');
  return new Analytics(Manager, options);
};

Manager.require = function (p) {
  return require(p);
};

Manager.debug = function () {
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
