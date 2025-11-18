const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const chalk = require('chalk');

class IsFirebaseProjectTest extends BaseTest {
  getName() {
    return 'is a firebase project';
  }

  async run() {
    const exists = jetpack.exists(`${this.self.firebaseProjectPath}/firebase.json`);
    return exists;
  }

  async fix() {
    console.log(chalk.red(`This is not a firebase project. Please use ${chalk.bold('firebase-init')} to set up.`));
    throw new Error('Not a Firebase project');
  }
}

module.exports = IsFirebaseProjectTest;
