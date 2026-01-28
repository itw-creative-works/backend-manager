const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const chalk = require('chalk');
const powertools = require('node-powertools');
const _ = require('lodash');
const helpers = require('./helpers');
const path = require('path');

// Load template
const bemConfigTemplate = helpers.loadJSON(path.resolve(__dirname, '../../../../templates/backend-manager-config.json'));

class BemConfigTest extends BaseTest {
  getName() {
    return 'using proper backend-manager-config.json';
  }

  async run() {
    // Set pass
    let pass = true;

    // Loop through all the keys in the template
    powertools.getKeys(bemConfigTemplate).forEach((key) => {
      const userValue = _.get(this.self.bemConfigJSON, key, undefined);

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
    console.log(chalk.red(`You need to open backend-manager-config.json and set each of these keys:`));

    // Write if it doesn't exist
    if (!this.context.hasContent(this.self.bemConfigJSON)) {
      jetpack.write(`${this.self.firebaseProjectPath}/functions/backend-manager-config.json`, {});
    }

    // Log what keys are missing
    powertools.getKeys(bemConfigTemplate).forEach((key) => {
      const userValue = _.get(this.self.bemConfigJSON, key, undefined);

      if (typeof userValue === 'undefined') {
        console.log(chalk.red.bold(`${key}`));
      } else {
        console.log(chalk.red(`${key} (${userValue})`));
      }
    });

    throw new Error('Missing required backend-manager-config.json keys');
  }
}

module.exports = BemConfigTest;
