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
      return reject(assistant.errorify(`Admin required.`, {code: 401}));
    } else if (!payload.data.payload.path) {
      return reject(assistant.errorify(`<path> parameter required`, {code: 400}));
    }

    // Log
    assistant.log(`main(): Read`,
      payload.data.payload.path,
    );

    // Read from Firestore
    self.libraries.admin.database().ref(payload.data.payload.path)
    .on('value', (snapshot) => {
      const data = snapshot.val();
      return resolve({data: data});
    });
  });

};


module.exports = Module;
