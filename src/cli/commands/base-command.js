const chalk = require('chalk');

class BaseCommand {
  constructor(main) {
    this.main = main;
    this.firebaseProjectPath = main.firebaseProjectPath;
    this.argv = main.argv;
    this.options = main.options;
  }

  async execute() {
    throw new Error('Execute method must be implemented');
  }

  log(...args) {
    console.log(...args);
  }

  logError(message) {
    console.log(chalk.red(message));
  }

  logSuccess(message) {
    console.log(chalk.green(message));
  }

  logWarning(message) {
    console.log(chalk.yellow(message));
  }
}

module.exports = BaseCommand;