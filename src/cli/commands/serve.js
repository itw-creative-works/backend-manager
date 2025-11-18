const BaseCommand = require('./base-command');
const powertools = require('node-powertools');
const _ = require('lodash');

class ServeCommand extends BaseCommand {
  async execute() {
    const self = this.main;

    // Run setup
    const SetupCommand = require('./setup');
    const setupCmd = new SetupCommand(self);
    await setupCmd.execute();

    const port = self.argv.port || _.get(self.argv, '_', [])[1] || '5000';

    // Execute
    await powertools.execute(`firebase serve --port ${port}`, { log: true });
  }
}

module.exports = ServeCommand;