const _ = require('lodash')

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
    let user = null;
    if (payload.user.roles.admin && payload.data.payload.uid) {
      await self.libraries.admin.firestore().doc(`users/${payload.data.payload.uid}`)
      .get()
      .then(async function (doc) {
        const data = doc.data();
        if (data) {
          user = data;
        } else {
          throw new Error('User does not exist')
        }
      })
      .catch(function (e) {
        user = e;
      })
    } else if (payload.user.authenticated) {
      user = payload.user;
    }

    if (user instanceof Error) {
      return reject(assistant.errorManager(user, {code: 400, sentry: false, send: false, log: false}).error)
    } else if (!user) {
      return reject(assistant.errorManager(`Admin or authenticated user required.`, {code: 401, sentry: false, send: false, log: false}).error)
    } else {
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
    }

  });

};


module.exports = Module;
