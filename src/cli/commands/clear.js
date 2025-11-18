const BaseCommand = require('./base-command');

class ClearCommand extends BaseCommand {
  async execute() {
    process.stdout.write("\u001b[3J\u001b[2J\u001b[1J");
    console.clear();
    process.stdout.write("\u001b[3J\u001b[2J\u001b[1J");
  }
}

module.exports = ClearCommand;