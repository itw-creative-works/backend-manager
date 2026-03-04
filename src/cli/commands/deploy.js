const BaseCommand = require('./base-command');
const powertools = require('node-powertools');

class DeployCommand extends BaseCommand {
  async execute() {
    const self = this.main;

    // Quick check that not using local packages
    const allDeps = JSON.stringify(self.packageJSON.dependencies || {}) + JSON.stringify(self.packageJSON.devDependencies || {});
    if (allDeps.includes('file:')) {
      this.logError(`Please remove local packages before deploying!`);
      return;
    }

    // Execute
    await powertools.execute('firebase deploy', { log: true });
  }
}

module.exports = DeployCommand;