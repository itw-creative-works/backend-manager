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
      const uid = _.get(user, 'auth.uid', null);
      const id = _.get(payload.data.payload, 'id', 'sessions/app');

      assistant.log(`Signing out of all active sessions for ${uid} @ ${id}`, {environment: 'production'})

      await self.libraries.admin.database().ref(id)
      .orderByChild('uid')
      .equalTo(uid)
      .once('value')
      .then(async (snap) => {
        const data = snap.val();
        const keys = Object.keys(data || {});
        for (var i = 0; i < keys.length; i++) {
          const key = keys[i];
          self.assistant.log(`Signing out: ${key}`, {environment: 'production'});
          await self.libraries.admin.database().ref(`${id}/${key}/command`).set('signout').catch(e => self.assistant.error(`Failed to signout ${key}`, e))
          await powertools.wait(3000);
          await self.libraries.admin.database().ref(`${id}/${key}`).remove().catch(e => self.assistant.error(`Failed to delete ${key}`, e))
        }
      })
      .catch(e => {
        console.error('Session query error', e);
      })

      await self.libraries.admin
        .auth()
        .revokeRefreshTokens(uid)
        .then(() => {
          return resolve({data: {message: `Successfully signed ${uid} out of all sessions`}});
        })
        .catch(e => {
          return reject(assistant.errorManager(`Failed to sign out of all sessions: ${e}`, {code: 500, sentry: false, send: false, log: false}).error)
        })
    })
    .catch(e => {
      return reject(e);
    })
  });

};


module.exports = Module;
