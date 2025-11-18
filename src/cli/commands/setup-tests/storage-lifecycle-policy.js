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
      const buckets = [
        {
          name: `us.artifacts.${self.projectId}.appspot.com`,
          config: path.resolve(`${__dirname}/../../../../templates/storage-lifecycle-config-1-day.json`)
        },
        {
          name: `bm-backup-firestore-${self.projectId}`,
          config: path.resolve(`${__dirname}/../../../../templates/storage-lifecycle-config-30-days.json`)
        }
      ];

      try {
        for (const bucket of buckets) {
          // Check if bucket exists first
          const checkCommand = `gsutil ls -b gs://${bucket.name}`;
          const exists = await powertools.execute(checkCommand, { log: false })
            .then(() => true)
            .catch(() => false);

          if (exists) {
            const command = `gsutil lifecycle set ${bucket.config} gs://${bucket.name}`;
            await powertools.execute(command, { log: true });
          } else {
            console.log(chalk.yellow(`Skipping bucket gs://${bucket.name} (does not exist)`));
          }
        }
        resolve('Success');
      } catch (e) {
        console.error(chalk.red(`Failed to set storage lifecycle policy`, e));
        reject(e);
      }
    });
  }
}

module.exports = StorageLifecyclePolicyTest;
