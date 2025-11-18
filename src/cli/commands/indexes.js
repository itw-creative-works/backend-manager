const BaseCommand = require('./base-command');
const chalk = require('chalk');
const jetpack = require('fs-jetpack');
const powertools = require('node-powertools');
const _ = require('lodash');

class IndexesCommand extends BaseCommand {
  async get(filePath = undefined, log = true) {
    const self = this.main;
    
    return new Promise(async (resolve, reject) => {
      const finalPath = `${self.firebaseProjectPath}/${filePath || 'firestore.indexes.json'}`;
      let existingIndexes;

      // Read existing indexes
      try {
        existingIndexes = require(`${self.firebaseProjectPath}/firestore.indexes.json`);
      } catch (e) {
        if (log !== false) {
          console.error('Failed to read existing local indexes', e);
        }
      }

      // Run the command
      await powertools.execute(`firebase firestore:indexes > ${finalPath}`, { log: true })
        .then((output) => {
          const newIndexes = require(finalPath);

          // Log
          if (log !== false) {
            this.logSuccess(`Saving indexes to: ${finalPath}`);

            // Check if the indexes are different
            const equal = _.isEqual(newIndexes, existingIndexes);
            if (!equal) {
              this.logError(`The live and local index files did not match and have been overwritten by the ${chalk.bold('live indexes')}`);
            }
          }

          // Return
          return resolve(newIndexes);
        })
        .catch((e) => {
          // Return
          return reject(e);
        });
    });
  }
}

module.exports = IndexesCommand;