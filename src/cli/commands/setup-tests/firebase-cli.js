const BaseTest = require('./base-test');
const chalk = require('chalk');
const powertools = require('node-powertools');

class FirebaseCliTest extends BaseTest {
  getName() {
    return 'firebase CLI is installed';
  }

  async run() {
    try {
      const result = await powertools.execute('firebase --version', { log: false });
      return true;
    } catch (error) {
      console.error(chalk.red('Firebase CLI is not installed or not accessible'));
      console.error(chalk.red('Error: ' + error.message));
      return false;
    }
  }

  async fix() {
    console.log(chalk.red(`There is no automatic fix for this check.`));
    console.log(chalk.red(`Firebase CLI is not installed. Please install it by running:`));
    console.log(chalk.yellow(`npm install -g firebase-tools`));
    console.log(chalk.red(`After installation, run ${chalk.bold('npx bm setup')} again.`));
    throw new Error('Firebase CLI not installed');
  }
}

module.exports = FirebaseCliTest;
