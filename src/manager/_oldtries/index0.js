function BackendManager(options) {
  if (!this.initialized) {
    console.log('Called BackendManager constructor');
    this.exports = options.exports;
    cors = options.cors;
    functions = options.functions;
    admin = options.admin;
    this.initialized = true;

    this.exports.backendmanager_webhookTest =
    functions
    .runWith( { memory: '256MB', timeoutSeconds: 60 } )
    .https.onRequest(async (req, res) => {
      return cors(req, res, async () => {
        return res.status(200).json({data: 'test'});
      });
    });
  }
}

BackendManager.prototype.init = function () {


};


module.exports = BackendManager;
