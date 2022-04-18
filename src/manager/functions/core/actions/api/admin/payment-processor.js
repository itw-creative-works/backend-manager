const _ = require('lodash');

function Module() {

}

Module.prototype.init = async function (s, payload) {
  const self = this;
  self.Manager = s.Manager;
  self.libraries = s.Manager.libraries;
  self.assistant = s.Manager.assistant;
  self.payload = payload;

  return self;
};

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    if (!payload.user.roles.admin) {
      return reject(assistant.errorManager(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    }

    const productId = _.get(payload, 'data.payload.payload.details.productIdGlobal');
    if (!productId) {
      return reject(assistant.errorManager(`No productId`, {code: 400, sentry: false, send: false, log: false}).error)
    }
    const processorPath = `${process.cwd()}/payment-processors/${productId}.js`
    let processor;
    // console.log('---processorPath', processorPath);
    try {
      processor = new (require(processorPath));
      processor.Manager = self.Manager;
    } catch (e) {
      self.assistant.error('Error loading processor', processorPath, e, {environment: 'production'})
      return resolve({data: {}})
    }

    await processor.process(payload.data.payload)
    .then(result => {
      return resolve({data: result});
    })
    .catch(e => {
      return reject(assistant.errorManager(`Payment processor @ "${processorPath}" failed: ${e}`, {code: 400, sentry: true, send: false, log: false}).error)
    })
  });

};


module.exports = Module;
