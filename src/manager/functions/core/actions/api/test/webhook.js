function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;
  const powertools = Manager.require('node-powertools');

  return new Promise(async function(resolve, reject) {

    if (payload.data.payload.delay > 0) {
      await powertools.wait(payload.data.payload.delay)
    }

    if (payload.data.payload.status >= 200 && payload.data.payload.status <= 299) {
      return resolve({data: payload.data.payload.response, status: payload.data.payload.status});
    } else if (payload.data.payload.status >= 400 && payload.data.payload.status <= 599) {
      return reject(assistant.errorManager(payload.data.payload.response || 'Unknown error message provided', {code: payload.data.payload.status, sentry: false, send: false, log: false}).error)
    }

  });

};


module.exports = Module;
