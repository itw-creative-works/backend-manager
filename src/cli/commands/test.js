const BaseCommand = require('./base-command');
const powertools = require('node-powertools');

class TestCommand extends BaseCommand {
  async execute() {
    const self = this.main;
    
    // Run setup first
    const SetupCommand = require('./setup');
    const setupCmd = new SetupCommand(self);
    await setupCmd.execute();

    const MOCHA_PKG_SCRIPT = 'mocha ../test/ --recursive --timeout=10000';
    
    // Execute
    await powertools.execute(`firebase emulators:exec --only firestore "npx ${MOCHA_PKG_SCRIPT}"`, { log: true });
  }
}

module.exports = TestCommand;