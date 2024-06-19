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
    Api.resolveUser({adminRequired: true})
    .then(async (user) => {
      // TODO: resolve the account and send back
      // - Limits for the account
      // - Usage for the account
      // - Plan for the account

      // used in EM, WM when signing in or running account().resolve()
      // on WM, it should hide and show the auth-xxx-xxx things in WM
    })
    .catch(e => {
      return reject(e);
    })
  });

};

module.exports = Module;
