module.exports = function(options) {
  console.log('Called BackendManager/webhookTest.js');
  return options.functions
    .runWith( { memory: '256MB', timeoutSeconds: 60 } )
    .https.onRequest(async (req, res) => {
      console.log('Called BackendManager/webhookTest.js INNER');
      return cors(req, res, async () => {
        return res.status(200).json({data: 'test'});
      });
    });
};
