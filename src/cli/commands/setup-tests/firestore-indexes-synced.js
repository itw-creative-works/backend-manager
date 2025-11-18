const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const chalk = require('chalk');
const _ = require('lodash');
const inquirer = require('inquirer');

class FirestoreIndexesSyncedTest extends BaseTest {
  getName() {
    return 'firestore indexes synced';
  }

  async run() {
    const self = this.self;
    const tempPath = '_firestore.indexes.json';

    const commands = require('../index');
    const IndexesCommand = commands.IndexesCommand;
    const indexesCmd = new IndexesCommand(self);

    const liveIndexes = await indexesCmd.get(tempPath, false);

    const localIndexes_exists = jetpack.exists(`${self.firebaseProjectPath}/firestore.indexes.json`);
    let localIndexes;
    if (localIndexes_exists) {
      localIndexes = require(`${self.firebaseProjectPath}/firestore.indexes.json`);
    }
    const equal = _.isEqual(liveIndexes, localIndexes);

    if (localIndexes_exists && !equal) {
      console.log(chalk.red(`To fix this...`));
      console.log(chalk.red(`  - ${chalk.bold('npx bm indexes:get')} to overwrite Firestore's local indexes with the live indexes`));
      console.log(chalk.red('  OR'));
      console.log(chalk.red(`  - ${chalk.bold('firebase deploy --only firestore:indexes')} to replace the live indexes.`));
    }

    jetpack.remove(`${self.firebaseProjectPath}/${tempPath}`);

    return !localIndexes_exists || equal;
  }

  async fix() {
    const self = this.self;

    return new Promise((resolve, reject) => {
      inquirer.prompt([
        {
          type: 'confirm',
          name: 'replace',
          message: 'Would you like to replace the local indexes?',
          default: true,
        }
      ])
      .then(async (answer) => {
        if (answer.replace) {
          const commands = require('../index');
          const IndexesCommand = commands.IndexesCommand;
          const indexesCmd = new IndexesCommand(self);

          await indexesCmd.get(undefined, true);
          return resolve();
        } else {
          return reject();
        }
      });
    });
  }
}

module.exports = FirestoreIndexesSyncedTest;
