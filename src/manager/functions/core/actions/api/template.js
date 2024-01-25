function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    if (!payload.user.roles.admin) {
      return reject(assistant.errorify(`Admin required.`, {code: 401, sentry: false, send: false, log: false}));
    }

    // self.Api.resolveUser({adminRequired: false})
    // .then(async (user) => {
    //
    // })
    // .catch(e => {
    //   return reject(e);
    // })

    return resolve({data: {success: true}});

  });

};


module.exports = Module;
