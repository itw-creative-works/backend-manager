const jetpack = require('fs-jetpack');

module.exports = async ({ assistant, user, analytics }) => {

  // Send analytics event
  analytics.event('restart', {});

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin
  if (!user.roles.admin) {
    return assistant.respond('Admin required', { code: 403 });
  }

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
  return assistant.respond({success: true});
};
