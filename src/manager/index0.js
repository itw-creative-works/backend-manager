module.exports = function (args) {
  functions = args.ref.functions;

  // Main functions
  // console.log('Initialized BackendManager/index.js');
  args.ref.exports.bm_webhookTest =
  functions
  .runWith( { memory: '256MB', timeoutSeconds: 60 } )
  .https.onRequest(async (req, res) => {
    return require('./functions/webhookTest.js').main(args.ref, req, res, args.options);
  });

  args.ref.exports.bm_signUpHandler =
  functions
  .runWith( { memory: '256MB', timeoutSeconds: 60 } )
  .https.onRequest(async (req, res) => {
    return require('./functions/signUpHandler.js').main(args.ref, req, res, args.options);
  });

  // Test
  args.ref.exports.bm_test_createTestAccounts =
  functions
  .runWith( { memory: '256MB', timeoutSeconds: 60 } )
  .https.onRequest(async (req, res) => {
    return require('./functions/test/createTestAccounts.js').main(args.ref, req, res, args.options);
  });


    // exports.sendWelcomeEmail = functions.auth.user().onCreate((user) => {
    //   // ...
    // });
}

// how to split
// https://stackoverflow.com/questions/42958719/organize-cloud-functions-for-firebase
// https://bigcodenerd.org/split-cloud-functions-firebase/
// ref.exports.backendmanager_webhookTest = require('./functions/webhookTest.js')(ref);
