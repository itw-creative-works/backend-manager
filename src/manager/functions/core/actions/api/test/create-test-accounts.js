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

    assistant.log('User:', payload.user);

    return resolve({data: {user: user}});

  });

};


module.exports = Module;
