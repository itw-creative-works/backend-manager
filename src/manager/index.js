
function Manager(exporter, options) {
  this.libraries = {};
}

Manager.init = function (exporter, options) {
  let self = this;

  // Paths
  const core = './functions/core';
  const test = './functions/test';
  const wrappers = './functions/wrappers';

  // Convenience variables
  const functions = require('firebase-functions');
  const admin = require('firebase-admin');
  const cors = require('cors')({ origin: true });
  const lodash = require('lodash');
  const Assistant = require('backend-assistant');

  options = options || {};

  self.libraries = {
    functions: functions,
    admin: admin,
    cors: cors,
    lodash: lodash,
    Assistant: Assistant,
  }

  if (options.initializeApp) {
    try {
      let serviceAccount = require(`${process.cwd()}/service-account.json`);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
      });
    } catch (e) {
      console.error('Failed to call .initializeApp()', e);
    }
    // admin.firestore().settings({/* your settings... */ timestampsInSnapshots: true})
  }

  // Main functions
  exporter.bm_signUpHandler =
  functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/signUpHandler.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

  // Admin
  exporter.bm_createPost =
  functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/admin/createPost.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });
  exporter.bm_sendNotification =
  functions
  .runWith({memory: '1GB', timeoutSeconds: 420})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/admin/sendNotification.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });
  exporter.bm_query =
  functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${core}/admin/query.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

  // Test
  exporter.bm_test_webhook =
  functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${test}/webhook.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

  exporter.bm_test_authorize =
  functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${test}/authorize.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

  exporter.bm_test_createTestAccounts =
  functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    const Module = require(`${test}/createTestAccounts.js`)
    Module.init(self, { req: req, res: res, })
    return Module.main();
  });

};

Manager.getNewAssistant = function (req, res, options) {
  let self = this;
  options = options || {};
  return new self.libraries.Assistant().init(
  {
    req: req,
    res: res,
    admin: self.libraries.admin,
    functions: self.libraries.functions,
  },
  {
    accept: options.accept,
  })
};

module.exports = Manager;
