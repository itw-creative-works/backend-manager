const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const chalk = require('chalk');
const powertools = require('node-powertools');
const _ = require('lodash');

// Load template
const envRuntimeTemplate = require('./helpers').loadJSON(`${__dirname}/../../../../templates/runtimeconfig.json`);

class EnvRuntimeConfigTest extends BaseTest {
  getName() {
    return 'using proper .env with RUNTIME_CONFIG';
  }

  async run() {
    // Check if .env file exists
    const envPath = `${this.self.firebaseProjectPath}/functions/.env`;
    if (!jetpack.exists(envPath)) {
      return false;
    }

    // Check if RUNTIME_CONFIG exists in process.env
    if (!process.env.RUNTIME_CONFIG) {
      return false;
    }

    // Check if runtimeConfigJSON was parsed successfully
    if (!this.context.hasContent(this.self.runtimeConfigJSON)) {
      return false;
    }

    // Set pass
    let pass = true;

    // Loop through all the keys in the template
    powertools.getKeys(envRuntimeTemplate).forEach((key) => {
      const userValue = _.get(this.self.runtimeConfigJSON, key, undefined);

      // If the user value is undefined, then we need to set pass to false
      if (typeof userValue === 'undefined') {
        pass = false;
      }
    });

    // Return result
    return pass;
  }

  async fix() {
    console.log(chalk.red(`There is no automatic fix for this check.`));
    console.log(chalk.red(`You need to manually edit ${chalk.bold(`functions/.env`)} and ensure RUNTIME_CONFIG has these keys:`));

    // Log what keys are missing
    powertools.getKeys(envRuntimeTemplate).forEach((key) => {
      const userValue = _.get(this.self.runtimeConfigJSON, key, undefined);

      if (typeof userValue === 'undefined') {
        console.log(chalk.red.bold(`${key}`));
      } else {
        console.log(chalk.red(`${key} (${userValue})`));
      }
    });

    throw new Error('Missing required .env RUNTIME_CONFIG keys');
  }
}

module.exports = EnvRuntimeConfigTest;
