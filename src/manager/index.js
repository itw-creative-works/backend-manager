const path = require('path');

function Manager(exporter, options) {
  this.libraries = {};
}

Manager.init = function (exporter, options) {
  let self = this;

  // Paths
  const core = './functions/core';
  const test = './functions/test';
  const wrappers = './functions/wrappers';

  // Varibles
  let assistant;
  let config;

  // Load libraries
  self.libraries = {
    functions: require('firebase-functions'),
    admin: require('firebase-admin'),
    cors: require('cors')({ origin: true }),
    Assistant: require('backend-assistant'),
    sentry: null,
  };

  self.package = require(path.resolve(process.cwd(), '../package.json'));
  config = self.libraries.functions.config() || {};

  assistant = new self.libraries.Assistant().init();

  options = options || {};
  options.initialize = typeof options.initialize === 'undefined' ? true : options.initialize;
  options.sentry = typeof options.sentry === 'undefined' ? true : options.sentry;

  if (options.initialize) {
    try {
      let serviceAccount = require(`${process.cwd()}/service-account.json`);
      self.libraries.admin.initializeApp({
        credential: self.libraries.admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
      });
    } catch (e) {
      console.error('Failed to call .initializeApp()', e);
    }
    // admin.firestore().settings({/* your settings... */ timestampsInSnapshots: true})
  }

  if (options.sentry && config.sentry && config.sentry.dsn) {
    self.libraries.sentry = require('@sentry/node');
    self.libraries.sentry.init({
      dsn: config.sentry.dsn,
      release: `${self.package.name}@${self.package.version}`,
      beforeSend(event, hint) {
        console.log('---beforeSend');
        event.tags = event.tags || {};
        event.tags['function.name'] = assistant.meta.name;
        event.tags['function.type'] = assistant.meta.type;
        event.tags['environment'] = assistant.meta.environment;
        return event;
      },
    });
  }

  // Main functions
  exporter.bm_signUpHandler =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/signUpHandler.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

  // Admin
  exporter.bm_createPost =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/admin/createPost.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });
  exporter.bm_sendNotification =
  self.libraries.functions
  .runWith({memory: '1GB', timeoutSeconds: 420})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/admin/sendNotification.js`)
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

  // Test
  exporter.bm_test_webhook =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${test}/webhook.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

  exporter.bm_test_authorize =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${test}/authorize.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

  exporter.bm_test_createTestAccounts =
  self.libraries.functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${test}/createTestAccounts.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

};

Manager.getNewAssistant = function (ref, options) {
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
