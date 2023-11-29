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
      // const planExpireDate = new Date(_.get(payload.user, 'plan.expires.timestamp', 0));
      // if (planExpireDate >= new Date()) {
      //   payload.response.status = 401;
      //   payload.response.error = new Error(`Failed to delete user: There is an active paid subscription on this account. Please cancel it first and then try deleting the account again.`);
      //   return reject(payload.response.error);
      // }

      // Disallow deleting users with subscriptions in any state other than cancelled or active payments
      if (
        (user?.plan?.status && user?.plan?.status !== 'cancelled')
        || user?.plan?.payment?.active
      ) {
        // return reject(assistant.errorManager(`Failed to delete user: There is an active paid subscription on this account. Please cancel it first and then try deleting the account again.`, {code: 400, sentry: false, send: false, log: false}).error)
        // return reject(assistant.errorManager(`This account cannot be deleted until the paid subscription attached to it is cancelled. Please cancel the subscription and then try to delete the account.`, {code: 400, sentry: false, send: false, log: false}).error)
        return reject(assistant.errorManager(`This account cannot be deleted because it has a paid subscription attached to it. In order to delete the account, you must first cancel the paid subscription.`, {code: 400, sentry: false, send: false, log: false}).error)
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
