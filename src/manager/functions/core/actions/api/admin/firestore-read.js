function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Set defaults
    payload.data.payload.path = `${payload.data.payload.path || ''}`;
    payload.data.payload.options = payload.data.payload.options || {};

    // Perform checks
    if (!payload.user.roles.admin) {
      return reject(assistant.errorify(`Admin required.`, {code: 401, sentry: false, send: false, log: false}));
    } else if (!payload.data.payload.path) {
      return reject(assistant.errorify(`<path> parameter required`, {code: 400, sentry: false, send: false, log: false}));
    }

    // Read from Firestore
    await self.libraries.admin.firestore().doc(payload.data.payload.path)
    .get()
    .then(doc => {
      return resolve({data: doc.data()});
    })
    .catch(e => {
      return reject(assistant.errorify(e, {code: 500, sentry: false, send: false, log: false}));
    })
  });

};


module.exports = Module;
