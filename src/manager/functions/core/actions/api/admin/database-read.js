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
      payload.data.payload.options = payload.data.payload.options || {};

      if (!payload.data.payload.path) {
        return reject(assistant.errorManager(`<path> parameter required`, {code: 400, sentry: false, send: false, log: false}).error)
      } else {

        self.libraries.admin.database().ref(payload.data.payload.path)
        .on('value', (snapshot) => {
          const data = snapshot.val();
          return resolve({data: data});
        });

      }

    } else {
      return reject(assistant.errorManager(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    }

  });

};


module.exports = Module;
