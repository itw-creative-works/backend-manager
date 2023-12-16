const _ = require('lodash');
const fetch = require('wonderful-fetch');

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
      // Disallow deleting users with subscriptions in any state other than cancelled or active payments
      if (
        (user?.plan?.status && user?.plan?.status !== 'cancelled')
        || user?.plan?.payment?.active
      ) {
        return reject(assistant.errorManager(`This account cannot be deleted because it has a paid subscription attached to it. In order to delete the account, you must first cancel the paid subscription.`, {code: 400, sentry: false, send: false, log: false}).error)
      }

      // Signout of all sessions
      assistant.log(`Signout of all sessions...`);
      await fetch(`https://us-central1-${self.Manager.project.projectId}.cloudfunctions.net/bm_api`, {
        method: 'post',
        timeout: 30000,
        response: 'json',
        tries: 2,
        log: true,
        body: {
          backendManagerKey: self.Manager.config.backend_manager.key,
          command: 'user:sign-out-all-sessions',
          payload: {
            uid: user.uid,
          }
        },
      })
      .then((json) => {
        assistant.log(`Signout of all sessions success`, json);
      })
      .catch(e => {
        assistant.error(`Signout of all sessions failed`, e);
      })

      // Perform the delete
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
