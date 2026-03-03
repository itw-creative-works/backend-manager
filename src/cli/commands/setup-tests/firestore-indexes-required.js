const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const _ = require('lodash');
const chalk = require('chalk');
const requiredIndexes = require('./required-indexes');

class FirestoreIndexesRequiredTest extends BaseTest {
  getName() {
    return 'firestore indexes have required BEM indexes';
  }

  async run() {
    const filePath = `${this.self.firebaseProjectPath}/firestore.indexes.json`;

    if (!jetpack.exists(filePath)) {
      return false;
    }

    const indexesFile = JSON.parse(jetpack.read(filePath));
    const existingIndexes = indexesFile.indexes || [];

    // Check that the first N indexes match the required indexes (must be at the top)
    const topIsCorrect = requiredIndexes.every((required, i) => {
      return this._indexMatches(existingIndexes[i], required);
    });

    // Check no duplicates exist (each required index should appear exactly once)
    const noDuplicates = requiredIndexes.every(required => {
      const count = existingIndexes.filter(existing => this._indexMatches(existing, required)).length;
      return count === 1;
    });

    return topIsCorrect && noDuplicates;
  }

  async fix() {
    const filePath = `${this.self.firebaseProjectPath}/firestore.indexes.json`;
    let indexesFile;

    if (jetpack.exists(filePath)) {
      indexesFile = JSON.parse(jetpack.read(filePath));
    } else {
      indexesFile = { indexes: [], fieldOverrides: [] };
    }

    indexesFile.indexes = indexesFile.indexes || [];

    // Remove any existing copies of required indexes
    for (const required of requiredIndexes) {
      indexesFile.indexes = indexesFile.indexes.filter(existing => !this._indexMatches(existing, required));
    }

    // Add all required indexes to the top (in reverse so they end up in correct order)
    for (let i = requiredIndexes.length - 1; i >= 0; i--) {
      indexesFile.indexes.unshift(requiredIndexes[i]);
    }

    jetpack.write(filePath, JSON.stringify(indexesFile, null, 2));

    console.log(chalk.green(`  + Ensured ${requiredIndexes.length} required indexes at top of indexes array`));
    console.log(chalk.yellow(`  Remember to deploy indexes: ${chalk.bold('firebase deploy --only firestore:indexes')}`));
  }

  /**
   * Check if an existing index matches a required index definition
   */
  _indexMatches(existing, required) {
    if (!existing) {
      return false;
    }

    // Must match collectionGroup
    if (existing.collectionGroup !== required.collectionGroup) {
      return false;
    }

    // Must match queryScope (default COLLECTION)
    if ((existing.queryScope || 'COLLECTION') !== (required.queryScope || 'COLLECTION')) {
      return false;
    }

    // Strip implicit __name__ fields that Firebase adds to live indexes
    const existingFields = (existing.fields || []).filter(f => f.fieldPath !== '__name__');

    // Must have same number of fields
    if (existingFields.length !== required.fields.length) {
      return false;
    }

    // Each field must match
    return required.fields.every((reqField, i) => {
      const exField = existingFields[i];

      if (exField.fieldPath !== reqField.fieldPath) {
        return false;
      }

      // Match order or arrayConfig
      if (reqField.arrayConfig) {
        return exField.arrayConfig === reqField.arrayConfig;
      }

      return exField.order === reqField.order;
    });
  }
}

module.exports = FirestoreIndexesRequiredTest;
