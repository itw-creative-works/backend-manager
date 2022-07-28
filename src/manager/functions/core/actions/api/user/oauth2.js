const _ = require('lodash')

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    self.Api.resolveUser({adminRequired: true})
    .then(async (user) => {
      // return resolve({data: {success: true}});
      // return reject(assistant.errorManager(`Failed to delete user: ${e}`, {code: 400, sentry: false, send: false, log: false}).error)
      console.log('---payload', payload);
    })
    .catch(e => {
      return reject(e);
    })
  });

};


module.exports = Module;
