const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const chalk = require('chalk');
const _ = require('lodash');
const inquirer = require('inquirer');
const powertools = require('node-powertools');

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

    // Firebase adds implicit properties to live indexes (__name__ fields, density, etc.)
    // and returns them in a different order. Normalize before comparing.
    const normalizeIndexes = (indexes) => {
      if (!indexes?.indexes) {
        return indexes;
      }
      return {
        ...indexes,
        indexes: _.sortBy(indexes.indexes.map(idx => {
          const { density, ...rest } = idx;
          return {
            ...rest,
            fields: (rest.fields || []).filter(f => f.fieldPath !== '__name__'),
          };
        }), idx => `${idx.collectionGroup}:${(idx.fields || []).map(f => f.fieldPath).join(',')}`),
      };
    };

    const equal = _.isEqual(normalizeIndexes(liveIndexes), normalizeIndexes(localIndexes));

    jetpack.remove(`${self.firebaseProjectPath}/${tempPath}`);

    if (!equal && localIndexes_exists) {
      // Log what differs so the user can see why (use stripped versions for accurate comparison)
      const strippedLocal = normalizeIndexes(localIndexes);
      const strippedLive = normalizeIndexes(liveIndexes);
      const localOnly = _.differenceWith(strippedLocal?.indexes || [], strippedLive?.indexes || [], _.isEqual);
      const liveOnly = _.differenceWith(strippedLive?.indexes || [], strippedLocal?.indexes || [], _.isEqual);

      if (localOnly.length > 0) {
        console.log(chalk.yellow(`  Indexes in local but not live:`));
        for (const idx of localOnly) {
          console.log(chalk.gray(`    - ${idx.collectionGroup} [${(idx.fields || []).map(f => `${f.fieldPath} ${f.order || f.arrayConfig}`).join(', ')}]`));
        }
      }
      if (liveOnly.length > 0) {
        console.log(chalk.yellow(`  Indexes in live but not local:`));
        for (const idx of liveOnly) {
          console.log(chalk.gray(`    - ${idx.collectionGroup} [${(idx.fields || []).map(f => `${f.fieldPath} ${f.order || f.arrayConfig}`).join(', ')}]`));
        }
      }
      if (localOnly.length === 0 && liveOnly.length === 0) {
        // Indexes arrays match but fieldOverrides or other top-level keys differ
        const localKeys = Object.keys(localIndexes || {});
        const liveKeys = Object.keys(liveIndexes || {});
        const allKeys = _.union(localKeys, liveKeys);
        for (const key of allKeys) {
          if (!_.isEqual(localIndexes?.[key], liveIndexes?.[key])) {
            console.log(chalk.yellow(`  Difference in "${key}":`));
            console.log(chalk.gray(`    Local: ${JSON.stringify(localIndexes?.[key])}`));
            console.log(chalk.gray(`    Live:  ${JSON.stringify(liveIndexes?.[key])}`));
          }
        }
      }
    }

    return !localIndexes_exists || equal;
  }

  async fix() {
    const self = this.self;

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'direction',
        message: 'Firestore indexes are out of sync. Which direction?',
        choices: [
          {
            name: `Local → Live   (replace ${chalk.bold('live')} indexes with ${chalk.bold('local')})`,
            value: 'local-to-live',
          },
          {
            name: `Live → Local   (replace ${chalk.bold('local')} indexes with ${chalk.bold('live')})`,
            value: 'live-to-local',
          },
          {
            name: 'Skip',
            value: 'skip',
          },
        ],
      },
    ]);

    if (answer.direction === 'live-to-local') {
      const commands = require('../index');
      const IndexesCommand = commands.IndexesCommand;
      const indexesCmd = new IndexesCommand(self);

      await indexesCmd.get(undefined, true);
    } else if (answer.direction === 'local-to-live') {
      console.log(chalk.yellow(`  Deploying local indexes to live...`));

      await powertools.execute('firebase deploy --only firestore:indexes', {
        log: true,
        cwd: self.firebaseProjectPath,
      });

      console.log(chalk.green(`  ✓ Live indexes updated from local`));
    }
  }
}

module.exports = FirestoreIndexesSyncedTest;
