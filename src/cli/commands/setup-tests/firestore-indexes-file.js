const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const chalk = require('chalk');

class FirestoreIndexesFileTest extends BaseTest {
  getName() {
    return 'update firestore indexes file';
  }

  async run() {
    const self = this.self;
    const exists = jetpack.exists(`${self.firebaseProjectPath}/firestore.indexes.json`);
    return exists;
  }

  async fix() {
    const self = this.self;
    const name = 'firestore.indexes.json';
    const filePath = `${self.firebaseProjectPath}/${name}`;
    const exists = jetpack.exists(filePath);

    if (!exists) {
      console.log(chalk.yellow(`Writing new ${name} file...`));

      const commands = require('../index');
      const IndexesCommand = commands.IndexesCommand;
      const indexesCmd = new IndexesCommand(self);

      await indexesCmd.get(name, false);
    }
  }
}

module.exports = FirestoreIndexesFileTest;
