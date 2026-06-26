const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const chalk = require('chalk').default;
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
      // Skip if an ancestor is explicitly set to a non-object value (e.g. stripe: false)
      if (this._isAncestorDisabled(key)) {
        return;
      }

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
    const ui = require('../../utils/ui');

    // Copy template if config doesn't exist or is empty
    if (!this.context.hasContent(this.self.bemConfigJSON)) {
      const templatePath = path.resolve(__dirname, '../../../../templates/backend-manager-config.json');
      jetpack.copy(templatePath, `${this.self.firebaseProjectPath}/functions/backend-manager-config.json`, { overwrite: true });
    }

    // Collect the keys that are still missing (these are what the user must fill in).
    const missing = [];
    powertools.getKeys(bemConfigTemplate).forEach((key) => {
      // Skip if an ancestor is explicitly set to a non-object value (e.g. stripe: false)
      if (this._isAncestorDisabled(key)) {
        return;
      }
      const userValue = _.get(this.self.bemConfigJSON, key, undefined);
      if (typeof userValue === 'undefined') {
        missing.push(key);
      }
    });

    ui.note(`Open ${chalk.bold('backend-manager-config.json')} and set the missing keys below:`, 3);
    for (const key of missing) {
      console.log(`${ui.indent(4)}${chalk.red('•')} ${key}`);
    }

    // Surface a compact version in the summary block (the full list printed above).
    const preview = missing.slice(0, 8);
    const summaryDetails = [
      chalk.dim(`Set ${chalk.bold(missing.length)} missing key(s) in backend-manager-config.json:`),
      ...preview.map((key) => `${chalk.red('•')} ${key}`),
    ];
    if (missing.length > preview.length) {
      summaryDetails.push(chalk.dim(`…and ${missing.length - preview.length} more (see list above)`));
    }

    const error = new Error('Missing required backend-manager-config.json keys');
    error.summaryDetails = summaryDetails;
    throw error;
  }
  /**
   * Check if any ancestor of a dot-notation key is a non-object value (e.g. false)
   * This means the key is intentionally disabled, not missing
   */
  _isAncestorDisabled(key) {
    const parts = key.split('.');
    let current = this.self.bemConfigJSON;

    for (let i = 0; i < parts.length - 1; i++) {
      current = current?.[parts[i]];

      if (current !== undefined && current !== null && typeof current !== 'object') {
        return true;
      }
    }

    return false;
  }
}

module.exports = BemConfigTest;
