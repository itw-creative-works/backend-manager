const os = require('os');
const path = require('path');
const argv = require('yargs')(process.argv.slice(2)).argv;
const _ = require('lodash');

// Abort if running from ~/node_modules (accidental home directory install)
const _homeDir = os.homedir();
if (__dirname.startsWith(path.join(_homeDir, 'node_modules'))) {
  console.error(`\nERROR: BEM is running from ~/node_modules (home directory install).`);
  console.error(`This shadows the local project copy. Fix:`);
  console.error(`  rm -rf ~/node_modules ~/package.json ~/package-lock.json\n`);
  process.exit(1);
}

// Import commands
const VersionCommand = require('./commands/version');
const ClearCommand = require('./commands/clear');
const CwdCommand = require('./commands/cwd');
const SetupCommand = require('./commands/setup');
const InstallCommand = require('./commands/install');
const ServeCommand = require('./commands/serve');
const DeployCommand = require('./commands/deploy');
const TestCommand = require('./commands/test');
const EmulatorCommand = require('./commands/emulator');
const CleanCommand = require('./commands/clean');
const IndexesCommand = require('./commands/indexes');
const WatchCommand = require('./commands/watch');
const StripeCommand = require('./commands/stripe');
const FirestoreCommand = require('./commands/firestore');
const AuthCommand = require('./commands/auth');
const LogsCommand = require('./commands/logs');
const McpCommand = require('./commands/mcp');

function Main() {}

Main.prototype.process = async function (args) {
  const self = this;
  self.options = {};
  self.argv = argv;
  self.firebaseProjectPath = process.cwd();
  self.firebaseProjectPath = self.firebaseProjectPath.match(/\/functions$/) ? self.firebaseProjectPath.replace(/\/functions$/, '') : self.firebaseProjectPath;
  self.testCount = 0;
  self.testTotal = 0;
  self.default = {};
  self.packageJSON = require('../../package.json');
  self.default.version = self.packageJSON.version;

  // Parse arguments into options
  for (var i = 0; i < args.length; i++) {
    self.options[args[i]] = true;
  }

  // Version command
  if (self.options.v || self.options.version || self.options['-v'] || self.options['-version']) {
    const cmd = new VersionCommand(self);
    return await cmd.execute();
  }

  // Clear command
  if (self.options.clear) {
    const cmd = new ClearCommand(self);
    return await cmd.execute();
  }

  // CWD command
  if (self.options.cwd) {
    const cmd = new CwdCommand(self);
    return await cmd.execute();
  }

  // Setup command
  if (self.options.setup) {
    const cmd = new SetupCommand(self);
    return await cmd.execute();
  }

  // Install local BEM
  if ((self.options.i || self.options.install) && (self.options.dev || self.options.development) || self.options.local) {
    const cmd = new InstallCommand(self);
    return await cmd.execute('local');
  }

  // Install live BEM
  if ((self.options.i || self.options.install) && (self.options.prod || self.options.production) || self.options.live) {
    const cmd = new InstallCommand(self);
    return await cmd.execute('live');
  }

  // Serve firebase
  if (self.options.serve) {
    const cmd = new ServeCommand(self);
    return await cmd.execute();
  }

  // Get indexes
  if (self.options['firestore:indexes:get'] || self.options['firestore:indexes'] || self.options['indexes:get']) {
    const cmd = new IndexesCommand(self);
    return await cmd.get(undefined, true);
  }

  // Deploy
  if (self.options.deploy) {
    const cmd = new DeployCommand(self);
    return await cmd.execute();
  }

  // Test
  if (self.options['test']) {
    const cmd = new TestCommand(self);
    return await cmd.execute();
  }

  // Emulator (keep-alive mode)
  if (self.options['emulator'] || self.options['emulators']) {
    const cmd = new EmulatorCommand(self);
    return await cmd.execute();
  }

  // Clean
  if (self.options['clean:npm']) {
    const cmd = new CleanCommand(self);
    return await cmd.execute();
  }

  // Watch (trigger hot reload when BEM source changes)
  if (self.options['watch']) {
    const cmd = new WatchCommand(self);
    return await cmd.execute();
  }

  // Stripe webhook forwarding (standalone)
  if (self.options['stripe'] || self.options['stripe:listen']) {
    const cmd = new StripeCommand(self);
    return await cmd.execute();
  }

  // Firestore utility commands
  if (self.options['firestore:get'] || self.options['firestore:set']
    || self.options['firestore:query'] || self.options['firestore:delete']) {
    const cmd = new FirestoreCommand(self);
    return await cmd.execute();
  }

  // Auth utility commands
  if (self.options['auth:get'] || self.options['auth:list']
    || self.options['auth:delete'] || self.options['auth:set-claims']) {
    const cmd = new AuthCommand(self);
    return await cmd.execute();
  }

  // Logs utility commands
  if (self.options['logs:read'] || self.options['logs:tail'] || self.options['logs:stream']) {
    const cmd = new LogsCommand(self);
    return await cmd.execute();
  }

  // MCP server
  if (self.options['mcp']) {
    const cmd = new McpCommand(self);
    return await cmd.execute();
  }
};

// Test method for setup command
Main.prototype.test = async function(name, fn, fix, args) {
  const self = this;
  let status;
  const chalk = require('chalk').default;

  return new Promise(async function(resolve, reject) {
    let passed = await fn();

    if (passed instanceof Error) {
      console.log(chalk.red(passed));
      process.exit(0);
    } else if (passed) {
      status = chalk.green('passed');
      self.testCount++;
      self.testTotal++;
    } else {
      status = chalk.red('failed');
      self.testTotal++;
    }
    console.log(chalk.bold(`[${self.testTotal}]`), `${name}:`, status);
    if (!passed) {
      console.log(chalk.yellow(`Fixing...`));
      fix(self, args)
      .then((r) => {
        console.log(chalk.green(`...done~!`));
        resolve();
      })
      .catch((e) => {
        console.log(chalk.red(`Failed to fix: ${e}`));
        if (self.options['--continue']) {
          console.log(chalk.yellow('⚠️ Continuing despite error because of --continue flag\n'));
          setTimeout(function () {
            resolve();
          }, 5000);
        } else {
          console.log(chalk.yellow('To force the setup to continue, run with the --continue flag\n'));
          reject();
        }
      });
    } else {
      resolve();
    }
  });
};

module.exports = Main;