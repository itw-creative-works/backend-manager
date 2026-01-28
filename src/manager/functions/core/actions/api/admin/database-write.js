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
    payload.data.payload.document = payload.data.payload.document || {};
    payload.data.payload.options = payload.data.payload.options || {};

    // Perform checks
    if (!payload.user.authenticated) {
      return reject(assistant.errorify(`Authentication required.`, {code: 401}));
    } else if (!payload.user.roles.admin) {
      return reject(assistant.errorify(`Admin required.`, {code: 403}));
    } else if (!payload.data.payload.path) {
      return reject(assistant.errorify(`<path> parameter required`, {code: 400}));
    }

    // Log
    assistant.log(`main(): Write`,
      payload.data.payload.path,
      payload.data.payload.document,
    );

    // Write to Firestore
    self.libraries.admin.database().ref(payload.data.payload.path)
    .set(payload.data.payload.document)
    .then(() => {
      return resolve({data: payload.data.payload.document});
    })
    .catch((e) => {
      return reject(assistant.errorify(e, {code: 500}));
    });
  });

};


module.exports = Module;
