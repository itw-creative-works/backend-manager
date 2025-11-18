const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const JSON5 = require('json5');
const chalk = require('chalk');

class ServiceAccountTest extends BaseTest {
  getName() {
    return 'has correct service-account.json';
  }

  async run() {
    let serviceAccount = jetpack.read(`${this.self.firebaseProjectPath}/functions/service-account.json`);

    // Make sure the service account exists
    if (!serviceAccount) {
      console.error(chalk.red('Missing service-account.json'));
      return false;
    }

    // Parse the service account
    serviceAccount = JSON5.parse(serviceAccount);

    // Check if project_id matches the project's ID
    if (this.self.projectId !== serviceAccount.project_id) {
      console.error(chalk.red('Mismatch between project name and service account project_id'));
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
