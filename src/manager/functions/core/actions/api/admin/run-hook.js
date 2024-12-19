// Load libraries
// const path = require('path');

function Module() {

}

Module.prototype.main = function () {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Perform checks
    if (!payload.user.roles.admin && assistant.isProduction()) {
      return reject(assistant.errorify(`Admin required.`, {code: 401}));
    }

    // Check for required options
    if (!payload.data.payload.path) {
      return reject(assistant.errorify(`Missing required parameter: path`, {code: 400}));
    }

    // Load the hook
    const hook = self.loadHook(payload);

    // Run the hook
    try {
      // Set variables
      hook.Manager = assistant.Manager;
      hook.assistant = assistant;
      hook.context = null;
      hook.libraries = Manager.libraries;

      // Get hook name
      const hookName = payload.data.payload.path.split('/').pop();

      // Set log prefix
      assistant.setLogPrefix(`cron/daily/${hookName}()`);

      // Run the hook
      const result = await hook.main(assistant);

      return resolve({data: result, status: 200});
    } catch (e) {
      return reject(assistant.errorify(e.message, {code: 500}));
    }
  });
};

Module.prototype.loadHook = function () {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const assistant = self.assistant;
  const payload = self.payload;

  // Set paths
  const paths = [
    `${Manager.rootDirectory}/functions/core/${payload.data.payload.path}`,
    `${Manager.cwd}/${payload.data.payload.path}`,
    `${Manager.cwd}/hooks/${payload.data.payload.path}`,
  ];

  // Loop through paths and try to load the hook
  for (let i = 0; i < paths.length; i++) {
    const current = pathify(paths[i]);

    // Log
    assistant.log('Trying path:', current);

    // Try to load the hook
    try {
      // If the hook is successfully loaded, break the loop
      return (new (require(current))());
    } catch (e) {
      // if the hook fails to load, continue to the next path
    }
  }
}

function pathify(path) {
  const fixed = path
    .replace('.js', '')

  // Return
  return `${fixed}.js`;
}

module.exports = Module;
