const argv = require('yargs').argv;
const _ = require('lodash');

// Import commands
const VersionCommand = require('./commands/version');
const ClearCommand = require('./commands/clear');
const CwdCommand = require('./commands/cwd');
const SetupCommand = require('./commands/setup');
const InstallCommand = require('./commands/install');
const ServeCommand = require('./commands/serve');
const DeployCommand = require('./commands/deploy');
const TestCommand = require('./commands/test');
const EmulatorsCommand = require('./commands/emulators');
const CleanCommand = require('./commands/clean');
const IndexesCommand = require('./commands/indexes');
const WatchCommand = require('./commands/watch');

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

  // Emulators (keep-alive mode)
  if (self.options['emulators'] || self.options['emulator']) {
    const cmd = new EmulatorsCommand(self);
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
};

// Test method for setup command
Main.prototype.test = async function(name, fn, fix, args) {
  const self = this;
  let status;
  const chalk = require('chalk');

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