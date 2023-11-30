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
    // Wait for all the promises to resolve
    Promise.all([
      // Backup the database
      // TODO: Disabled this because of Firebase's new PITR Disaster Recovery feature
      // fetch(`${Manager.project.functionsUrl}/bm_api`, {
      //   method: 'post',
      //   response: 'json',
      //   body: {
      //     backendManagerKey: Manager.config.backend_manager.key,
      //     command: 'admin:backup',
      //   }
      // })
      // .then(response => {
      //   assistant.log(`Successfully executed backup:`, response)
      // }),

      // Sync Firestore users to the database
      // TODO: This is not working becaues the pageToken is not relative any more when its saved...
      // fetch(`${Manager.project.functionsUrl}/bm_api`, {
      //   method: 'post',
      //   response: 'json',
      //   body: {
      //     backendManagerKey: Manager.config.backend_manager.key,
      //     command: 'admin:sync-users',
      //   }
      // })
      // .then(response => {
      //   assistant.log(`Successfully executed sync-users:`, response)
      // }),

      // More daily processes
      // ...
    ])
    .then(() => {
      assistant.log(`Successfully executed all daily processes:`)
      return resolve();
    })
    .catch(e => {
      assistant.errorManager(`Error executing all processes: ${e}`, {sentry: true, send: false, log: true})
      return reject(e);
    })
  });
}

module.exports = Module;
