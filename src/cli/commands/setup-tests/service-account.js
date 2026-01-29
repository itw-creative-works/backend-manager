const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const chalk = require('chalk');

class ServiceAccountTest extends BaseTest {
  getName() {
    return 'has correct service-account.json';
  }

  async run() {
    const serviceAccount = jetpack.read(`${this.self.firebaseProjectPath}/functions/service-account.json`);

    // Make sure the service account exists
    if (!serviceAccount) {
      console.error(chalk.red('Missing service-account.json'));
      return false;
    }

    return true;
  }

  async fix() {
    console.log(chalk.red(`There is no automatic fix for this check.`));
    console.log(chalk.red(`Please install a service account --> ` + chalk.yellow.red(`${this.self.projectUrl}/settings/serviceaccounts/adminsdk`)));
    throw new Error('Missing or incorrect service-account.json');
  }
}

module.exports = ServiceAccountTest;
