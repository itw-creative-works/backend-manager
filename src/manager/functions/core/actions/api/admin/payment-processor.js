const _ = require('lodash');
const jetpack = require('fs-jetpack');

function Module() {

}

Module.prototype.main = function () {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Check for admin
    if (!payload.user.roles.admin) {
      return reject(assistant.errorify(`Admin required.`, {code: 401}));
    }

    const productId = payload?.data?.payload?.payload?.details?.productIdGlobal;
    if (!productId) {
      return reject(assistant.errorify(`No productId`, {code: 400}));
    }
    const processorPath = `${Manager.cwd}/payment-processors/${productId}.js`
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
      return reject(assistant.errorify(`Payment processor @ "${processorPath}" failed: ${e}`, {code: 400, sentry: true}));
    })
  });

};


module.exports = Module;
