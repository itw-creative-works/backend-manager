module.exports = function (options) {
  if (!this.initialized) {
    console.log('Called BackendManager index.js');
    this.exports = options.exports;
    cors = options.cors;
    functions = options.functions;
    admin = options.admin;

    options.exports.backendmanager_webhookTest = require('./functions/webhookTest.js')(options);

    this.initialized = true;
  }
}
