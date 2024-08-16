const powertools = require('node-powertools');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const chalk = require('chalk');

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
    log(`Starting server (command=${command})`);

    // Start the server
    await powertools.execute(command, options, (serverProcess) => {
      serverProcess.on('exit', (code) => {
        const string = `(code=${code}, timestamp=${new Date().toISOString()})`;
        if (code !== 0) {
          error(`Server crashed ${string}`);
          error(`Restarting in 1 second...`);

          // Restart the server
          setTimeout(function () {
            error(`Restarting server...`);
            self.monitor();
          }, 1000);
        } else {
          log(`Server stopped safely ${string}`);
        }
      });
    })
    .then((r) => resolve)
    .catch((e) => reject);
  });
};

function log() {
  console.log(chalk.blue('[ServerManager]:'), ...arguments);
}

function error() {
  console.error(chalk.red('[ServerManager]:'), ...arguments);
}

// Check if the script is run directly from the command line
if (require.main === module) {
  const manager = new ServerManager();
  manager.monitor();
}

module.exports = ServerManager;
