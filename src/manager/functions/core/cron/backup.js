const fetch = require('wonderful-fetch');

function Module() {

}

Module.prototype.init = function (Manager, data) {
  const self = this;
  self.Manager = Manager;
  self.libraries = Manager.libraries;
  self.assistant = Manager.Assistant()

  self.context = data.context;
  return self;
}

Module.prototype.main = function() {
  const self = this;
  const Manager = self.Manager;
  const libraries = self.libraries;
  const assistant = self.assistant;
  const context = self.context;

  return new Promise(async function(resolve, reject) {
    fetch(`${Manager.project.functionsUrl}/bm_api`, {
      method: 'post',
      body: {
        backendManagerKey: Manager.config.backend_manager.key,
        command: 'admin:backup',
      }
    })
    .then(response => {
      assistant.log(`Successfully executed backup:`, response, {environment: 'production'})
      return resolve(response);
    })
    .catch(e => {
      assistant.errorManager(`Error executing backup: ${e}`, {sentry: true, send: false, log: true})
      return reject();
    })
  });
}

module.exports = Module;
