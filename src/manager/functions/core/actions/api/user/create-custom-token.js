const _ = require('lodash')

function Module() {

}

Module.prototype.init = async function (s, payload) {
  const self = this;
  self.Api = s;
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
    self.Api.resolveUser({adminRequired: true})
    .then(async (user) => {
      await self.libraries.admin.auth().createCustomToken(_.get(user, 'auth.uid', null))
      .then(token => {
        return resolve({data: {token: token}});
      })
      .catch(e => {
        return reject(assistant.errorManager(`Failed to create custom token: ${e}`, {code: 400, sentry: false, send: false, log: false}).error)
      })
    })
    .catch(e => {
      return reject(e);
    })
  });
};


module.exports = Module;
