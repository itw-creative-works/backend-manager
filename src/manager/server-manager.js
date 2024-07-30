const powertools = require('node-powertools');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

function ServerManager(command, options) {
  const self = this;

  // Set the command
  self.command = command;
  self.options = options;
}

ServerManager.prototype.monitor = function (command, options) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    // Use instance properties if arguments are not provided
    command = command || self.command;
    options = options || self.options;

    // Set the command
    command = command || yargs(hideBin(process.argv)).argv.command || 'npm start';

    // Set the options
    options = options || {};
    options.log = options.log === undefined ? true : options.log;

    // Log
    console.log('Starting server...', command);

    // Start the server
    await powertools.execute(command, options, (serverProcess) => {
      serverProcess.on('exit', (code) => {
        if (code !== 0) {
          console.log('Server crashed. Restarting...');

          // Restart the server
          setTimeout(function () {
            self.monitor();
          }, 1000);
        } else {
          console.log('Server stopped manually.');
        }
      });
    })
    .then((r) => resolve)
    .catch((e) => reject);
  });
};

// Check if the script is run directly from the command line
if (require.main === module) {
  const manager = new ServerManager();
  manager.monitor();
}

module.exports = ServerManager;
