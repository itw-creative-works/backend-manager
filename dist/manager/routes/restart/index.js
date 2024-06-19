function Route() {
  const self = this;

  return self;
}

Route.prototype.main = async function (assistant) {
  const self = this;

  // Set shortcuts
  const Manager = assistant.Manager;
  const usage = assistant.usage;
  const user = assistant.usage.user;
  const analytics = assistant.analytics;
  const settings = assistant.settings;

  // Load preloaded libraries
  const jetpack = require('fs-jetpack');

  // Send analytics event
  analytics.event({
    name: 'restart',
    params: {},
  });

  // Check for user authentication
  // if (!user.roles.admin) {
  //   return assistant.respond(`Admin required`, {code: 401});;
  // }

  // Log
  assistant.log('Restarting...');

  // Remove node_modules
  jetpack.remove('node_modules');

  // Perform delayed refresh to allow a successful response
  setTimeout(function () {
    require('child_process').exec('refresh', (error, stdout, stderr) => {
      // Quit the process if there is an error
      if (error || stderr) {
        console.log(`error: ${error ? error.message : stderr}`);
        return process.exit(1);
      }
    });
  }, 1000);

  // Return success
  assistant.respond({success: true});
};

module.exports = Route;
