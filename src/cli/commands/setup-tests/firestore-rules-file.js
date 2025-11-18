const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const chalk = require('chalk');

const bem_allRulesRegex = /(\/\/\/---backend-manager---\/\/\/)(.*?)(\/\/\/---------end---------\/\/\/)/sgm;
const bem_allRulesBackupRegex = /({{\s*?backend-manager\s*?}})/sgm;

class FirestoreRulesFileTest extends BaseTest {
  getName() {
    return 'update firestore rules file';
  }

  async run() {
    const self = this.self;
    const exists = jetpack.exists(`${self.firebaseProjectPath}/firestore.rules`);
    const contents = jetpack.read(`${self.firebaseProjectPath}/firestore.rules`) || '';
    const containsCore = contents.match(bem_allRulesRegex);
    const matchesVersion = contents.match(self.default.rulesVersionRegex);

    return (exists && !!containsCore && !!matchesVersion);
  }

  async fix() {
    const self = this.self;
    const name = 'firestore.rules';
    const path = `${self.firebaseProjectPath}/${name}`;
    const exists = jetpack.exists(path);
    let contents = jetpack.read(path) || '';

    if (!exists || !contents) {
      console.log(chalk.yellow(`Writing new ${name} file...`));
      jetpack.write(path, self.default.firestoreRulesWhole);
      contents = jetpack.read(path) || '';
    }

    const hasTemplate = contents.match(bem_allRulesRegex) || contents.match(bem_allRulesBackupRegex);
    if (!hasTemplate) {
      console.log(chalk.red(`Could not find rules template. Please edit ${name} file and add`), chalk.red(`{{backend-manager}}`), chalk.red(`to it.`));
      return;
    }

    const matchesVersion = contents.match(self.default.rulesVersionRegex);
    if (!matchesVersion) {
      contents = contents.replace(bem_allRulesBackupRegex, self.default.firestoreRulesCore);
      contents = contents.replace(bem_allRulesRegex, self.default.firestoreRulesCore);
      jetpack.write(path, contents);
      console.log(chalk.yellow(`Writing core rules to ${name} file...`));
    }
  }
}

module.exports = FirestoreRulesFileTest;
