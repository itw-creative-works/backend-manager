const BaseTest = require('./base-test');
const powertools = require('node-powertools');
const path = require('path');
const chalk = require('chalk');

class StorageLifecyclePolicyTest extends BaseTest {
  getName() {
    return 'set storage lifecycle policy';
  }

  async run() {
    const self = this.self;
    const result = await this.cmd_setStorageLifecycle(self).catch(e => e);
    return !(result instanceof Error);
  }

  async fix() {
    console.error(chalk.red(`There is no automatic fix. Please run: \n${chalk.bold('firebase deploy && npx bm setup')}`));
    throw new Error('No automatic fix available');
  }

  async cmd_setStorageLifecycle(self) {
    return new Promise(async (resolve, reject) => {
      const command = `gsutil lifecycle set {config} gs://{bucket}`
        .replace(/{config}/ig, path.resolve(`${__dirname}/../../../../templates/storage-lifecycle-config-1-day.json`))
        .replace(/{bucket}/ig, `us.artifacts.${self.projectId}.appspot.com`);
      const command2 = `gsutil lifecycle set {config} gs://{bucket}`
        .replace(/{config}/ig, path.resolve(`${__dirname}/../../../../templates/storage-lifecycle-config-30-days.json`))
        .replace(/{bucket}/ig, `bm-backup-firestore-${self.projectId}`);

      await powertools.execute(command, { log: true })
        .then(() => {
          return powertools.execute(command2, { log: true });
        })
        .then((output) => {
          resolve(output.stdout);
        })
        .catch((e) => {
          console.error(chalk.red(`Failed to set storage lifecycle policy`, e));
          reject(e);
        });
    });
  }
}

module.exports = StorageLifecyclePolicyTest;
