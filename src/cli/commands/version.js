const BaseCommand = require('./base-command');

class VersionCommand extends BaseCommand {
  async execute() {
    const version = this.main.packageJSON.version;
    this.log(`Backend manager is version: ${version}`);
  }
}

module.exports = VersionCommand;