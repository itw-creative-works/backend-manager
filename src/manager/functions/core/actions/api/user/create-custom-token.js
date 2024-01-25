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
      await self.libraries.admin.auth().createCustomToken(_.get(user, 'auth.uid', null))
      .then(token => {
        return resolve({data: {token: token}});
      })
      .catch(e => {
        return reject(assistant.errorify(`Failed to create custom token: ${e}`, {code: 400, sentry: false, send: false, log: false}));
      })
    })
    .catch(e => {
      return reject(e);
    })
  });
};


module.exports = Module;
