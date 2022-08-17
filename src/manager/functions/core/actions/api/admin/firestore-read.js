function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    if (payload.user.roles.admin) {

      payload.data.payload.path = `${payload.data.payload.path || ''}`;
      payload.data.payload.document = payload.data.payload.document || {};
      payload.data.payload.options = payload.data.payload.options || { merge: true };

      if (!payload.data.payload.path) {
        return reject(assistant.errorManager(`<path> parameter required`, {code: 400, sentry: false, send: false, log: false}).error)
      } else {
        await self.libraries.admin.firestore().doc(payload.data.payload.path)
        .get()
        .then(doc => {
          return resolve({data: doc.data()});
        })
        .catch(e => {
          return reject(assistant.errorManager(e, {code: 500, sentry: false, send: false, log: false}).error)
        })
      }

    } else {
      return reject(assistant.errorManager(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    }

  });

};


module.exports = Module;
