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
      const id = _.get(payload.data.payload, 'id', 'app');
      const session = `sessions/${id}`;

      let count = 0;

      await self.signOutOfSession(uid, session).then(r => count += r);
      // Legacy for somiibo and old electron-manager
      await self.signOutOfSession(uid, 'gatherings/online').then(r => count += r);

      await self.libraries.admin
        .auth()
        .revokeRefreshTokens(uid)
        .then(() => {
          return resolve({data: {sessions: count, message: `Successfully signed ${uid} out of all sessions`}});
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

Module.prototype.signOutOfSession = function (uid, session) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    let count = 0;

    assistant.log(`Signing out of all active sessions for ${uid} @ ${session}`, {environment: 'production'})

    await self.libraries.admin.database().ref(session)
    .orderByChild('uid')
    .equalTo(uid)
    .once('value')
    .then(async (snap) => {
      const data = snap.val() || {};
      const keys = Object.keys(data);

      for (var i = 0; i < keys.length; i++) {
        const key = keys[i];

        self.assistant.log(`Signing out: ${key}`, {environment: 'production'});
        
        // Send signout command
        await self.libraries.admin.database().ref(`${session}/${key}/command`)
          .set('signout')
          .catch(e => self.assistant.error(`Failed to signout of session ${key}`, e))

        // await powertools.wait(3000);

        // Delete session
        setTimeout(function () {
          self.libraries.admin.database().ref(`${session}/${key}`)
            .remove()
            .catch(e => self.assistant.error(`Failed to delete session ${key}`, e))          
        }, 30000);

        count++;
      }

      return resolve(count);
    })
    .catch(e => {
      assistant.errorManager(`Session query error for session ${session}: ${e}`, {code: 500, sentry: true, send: false, log: true})
      return reject(count)
    })
  });
}

module.exports = Module;
