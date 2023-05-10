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

      try {
        await self.signOutOfSession(uid, session)
          .then(r => count += r)

        // Legacy for somiibo and old electron-manager
        await self.signOutOfSession(uid, 'gatherings/online')
          .then(r => count += r)

        await self.libraries.admin
          .auth()
          .revokeRefreshTokens(uid)
          .then(() => {
            return resolve({data: {sessions: count, message: `Successfully signed ${uid} out of all sessions`}});
          })
          .catch(e => {
            return reject(assistant.errorManager(`Failed to sign out of all sessions: ${e}`, {code: 500, sentry: false, send: false, log: false}).error)
          })        
      } catch (e) {
        assistant.error(`@temp sign-out-all-sessions error: ${e}`);

        return reject(assistant.errorManager(`Failed to sign out of all sessions: ${e}`, {code: 500, sentry: false, send: false, log: false}).error)
      }
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

          assistant.log(`Signing out ${session}/${key}...`, {environment: 'production'});
          
          // Send signout command
          await self.libraries.admin.database().ref(`${session}/${key}/command`)
            .set('signout')
            .catch(e => assistant.error(`Failed to signout of session ${key}`, e, {environment: 'production'}))
          assistant.log(`@temp 1`, {environment: 'production'});

          // Delay so the client has time to react to the command
          await powertools.wait(5000);
          assistant.log(`@temp 2`, {environment: 'production'});

          // Delete session
          await self.libraries.admin.database().ref(`${session}/${key}`)
            .remove()
            .catch(e => assistant.error(`Failed to delete session ${key}`, e, {environment: 'production'}))          

          assistant.log(`Signed out successfully: ${key}`, {environment: 'production'});

          count++;
        }

        return resolve(count);
      })
      .catch(e => {
        assistant.errorManager(`Session query error for session ${session}: ${e}`, {code: 500, sentry: true, send: false, log: true})
        
        return reject(e)
      })
  });
}

module.exports = Module;
