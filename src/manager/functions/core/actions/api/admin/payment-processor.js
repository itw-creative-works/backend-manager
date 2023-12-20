const _ = require('lodash');
const jetpack = require('fs-jetpack');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    if (!payload.user.roles.admin) {
      return reject(assistant.errorify(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    }

    const productId = _.get(payload, 'data.payload.payload.details.productIdGlobal');
    if (!productId) {
      return reject(assistant.errorify(`No productId`, {code: 400, sentry: false, send: false, log: false}).error)
    }
    const processorPath = `${process.cwd()}/payment-processors/${productId}.js`
    let processor;
    // console.log('---processorPath', processorPath);

    try {
      if (!jetpack.exists(processorPath)) {
        self.assistant.warn('Subprocessor does not exist:', processorPath)

        return resolve({data: {}})
      }
      processor = new (require(processorPath));
      processor.Manager = self.Manager;
    } catch (e) {
      self.assistant.error('Subprocessor failed to load:', processorPath, e)

      return resolve({data: {}})
    }

    await processor.process(payload.data.payload)
    .then(result => {
      return resolve({data: result});
    })
    .catch(e => {
      return reject(assistant.errorify(`Payment processor @ "${processorPath}" failed: ${e}`, {code: 400, sentry: true, send: false, log: false}).error)
    })
  });

};


module.exports = Module;
