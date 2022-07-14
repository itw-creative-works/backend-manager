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

      assistant.log(`Getting active sessions for ${uid} @ ${id}`, {environment: 'production'})

      await self.libraries.admin.database().ref(id)
      .orderByChild('uid')
      .equalTo(uid)
      .once('value')
      .then(async (snap) => {
        const data = (snap.val() || []).filter(i => i);
        return resolve({data: data});
      })
      .catch(e => {
        return reject(assistant.errorManager(`Session query error: ${e}`, {code: 500, sentry: false, send: false, log: false}).error)
      })

    })
    .catch(e => {
      return reject(e);
    })
  });

};


module.exports = Module;
