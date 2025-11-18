const BaseCommand = require('./base-command');
const powertools = require('node-powertools');

class CleanCommand extends BaseCommand {
  async execute() {
    const NPM_CLEAN_SCRIPT = 'rm -fr node_modules && rm -fr package-lock.json && npm cache clean --force && npm install && npm rb';
    
    // Execute
    await powertools.execute(NPM_CLEAN_SCRIPT, { log: true });
  }
}

module.exports = CleanCommand;