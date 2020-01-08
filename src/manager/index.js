module.exports = function (args) {
  functions = args.ref.functions;
  let core = './functions/core';
  let test = './functions/test';
  let wrappers = './functions/wrappers';
  let options = args.options;

  if (options.initializeApp) {
    try {
      let serviceAccount = require(`${process.cwd()}/service-account.json`);
      args.ref.admin.initializeApp({
        credential: args.ref.admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
      });
    } catch (e) {
      console.error('Failed to call .initializeApp()', e);
    }
  }

  // Main functions
  args.ref.exports.bm_signUpHandler =
  functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    let Module = require(`${core}/signUpHandler.js`)
    Module.init({
      ref: args.ref,
      req: req,
      res: res,
    })
    return Module.main();
  });

  // args.ref.exports.bm_paymentProcessor =
  // functions
  // .runWith({memory: '256MB', timeoutSeconds: 60})
  // .https.onRequest(async (req, res) => {
  //   let Module = require(`${core}/paymentProcessor.js`)
  //   Module.init({
  //     ref: args.ref,
  //     req: req,
  //     res: res,
  //   })
  //   return Module.main();
  // });

  // Admin
  args.ref.exports.bm_createPost =
  functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    let Module = require(`${core}/admin/createPost.js`)
    Module.init({
      ref: args.ref,
      req: req,
      res: res,
    })
    return Module.main();
  });
  args.ref.exports.bm_sendNotification =
  functions
  .runWith({memory: '1GB', timeoutSeconds: 420})
  .https.onRequest(async (req, res) => {
    let Module = require(`${core}/admin/sendNotification.js`)
    Module.init({
      ref: args.ref,
      req: req,
      res: res,
    })
    return Module.main();
  });
  args.ref.exports.bm_query =
  functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    let Module = require(`${core}/admin/query.js`)
    Module.init({
      ref: args.ref,
      req: req,
      res: res,
    })
    return Module.main();
  });

  // Test
  args.ref.exports.bm_test_webhook =
  functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    let Module = require(`${test}/webhook.js`)
    Module.init({
      ref: args.ref,
      req: req,
      res: res,
    })
    return Module.main();
  });

  args.ref.exports.bm_test_authorizeAdmin =
  functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    let Module = require(`${test}/authorizeAdmin.js`)
    Module.init({
      ref: args.ref,
      req: req,
      res: res,
    })
    return Module.main();
  });

  args.ref.exports.bm_test_createTestAccounts =
  functions
  .runWith({memory: '256MB', timeoutSeconds: 60})
  .https.onRequest(async (req, res) => {
    let Module = require(`${test}/createTestAccounts.js`)
    Module.init({
      ref: args.ref,
      req: req,
      res: res,
    })
    return Module.main();
  });


    // exports.sendWelcomeEmail = functions.auth.user().onCreate((user) => {
    //   // ...
    // });
}

// how to split
// https://stackoverflow.com/questions/42958719/organize-cloud-functions-for-firebase
// https://bigcodenerd.org/split-cloud-functions-firebase/
// ref.exports.backendmanager_webhookTest = require('./functions/webhookTest.js')(ref);
