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
      // const planExpireDate = new Date(_.get(payload.user, 'plan.expires.timestamp', 0));
      // if (planExpireDate >= new Date()) {
      //   payload.response.status = 401;
      //   payload.response.error = new Error(`Failed to delete user: There is an active paid subscription on this account. Please cancel it first and then try deleting the account again.`);
      //   return reject(payload.response.error);
      // }
      const isPlanActive = _.get(user, 'plan.payment.active', null);
      if (isPlanActive === true) {
        return reject(assistant.errorManager(`Failed to delete user: There is an active paid subscription on this account. Please cancel it first and then try deleting the account again.`, {code: 400, sentry: false, send: false, log: false}).error)
      }

      await self.libraries.admin.auth().deleteUser(_.get(user, 'auth.uid', null))
      .then(() => {
        return resolve({data: {success: true}});
      })
      .catch(e => {
        return reject(assistant.errorManager(`Failed to delete user: ${e}`, {code: 400, sentry: false, send: false, log: false}).error)
      })
    })
    .catch(e => {
      return reject(e);
    })
  });

};


module.exports = Module;
