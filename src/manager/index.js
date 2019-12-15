module.exports = function (args) {
  console.log('Initialized BackendManager/index.js');
  functions = args.ref.functions;

  args.ref.exports.backendmanager_webhookTest =
    functions
    .runWith( { memory: '256MB', timeoutSeconds: 60 } )
    .https.onRequest(async (req, res) => {
      console.log('Called BackendManager/webhookTest.js INNER');
      return require('./functions/webhookTest.js')(args.ref, req, res, args.options);
    });
  args.ref.exports.backendmanager_signUpHandler =
    functions
    .runWith( { memory: '256MB', timeoutSeconds: 60 } )
    .https.onRequest(async (req, res) => {
      console.log('Called BackendManager/signUpHandler.js INNER');
      return require('./functions/signUpHandler.js')(args.ref, req, res, args.options);
    });

    // exports.sendWelcomeEmail = functions.auth.user().onCreate((user) => {
    //   // ...
    // });
}

// how to split
// https://stackoverflow.com/questions/42958719/organize-cloud-functions-for-firebase
// https://bigcodenerd.org/split-cloud-functions-firebase/
// ref.exports.backendmanager_webhookTest = require('./functions/webhookTest.js')(ref);
