const BaseCommand = require('./base-command');
const chalk = require('chalk');
const powertools = require('node-powertools');

class DeployCommand extends BaseCommand {
  async execute() {
    const self = this.main;
    
    // Run setup first
    const SetupCommand = require('./setup');
    const setupCmd = new SetupCommand(self);
    await setupCmd.execute();

    // Quick check that not using local packages
    let deps = JSON.stringify(self.package.dependencies);
    let hasLocal = deps.includes('file:');
    if (hasLocal) {
      this.logError(`Please remove local packages before deploying!`);
      return;
    }

    // Execute
    await powertools.execute('firebase deploy', { log: true });
  }
}

module.exports = DeployCommand;