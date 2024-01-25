function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    // Check if the user is an admin
    if (!payload.user.roles.admin && assistant.meta.environment === 'production') {
      return reject(assistant.errorify(`Admin required.`, {code: 401, sentry: false, send: false, log: false}));
    }

    // Check if the ID is set
    if (!payload.data.payload.id) {
      return reject(assistant.errorify(`Missing parameter {id}`, {code: 400, sentry: false, send: false, log: false}));
    }

    // Run the cron job
    Manager._process((new (require(`../../../cron/${payload.data.payload.id}.js`))()).init(Manager, { context: {}, }))
    .then((res) => {
      return resolve({data: res});
    })
    .catch(e => {
      return reject(assistant.errorify(e, {code: 400, sentry: false, send: false, log: false}));
    })
  });

};


module.exports = Module;
