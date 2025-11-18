const BaseCommand = require('./base-command');

class CwdCommand extends BaseCommand {
  async execute() {
    this.log('cwd: ', this.main.firebaseProjectPath);
  }
}

module.exports = CwdCommand;