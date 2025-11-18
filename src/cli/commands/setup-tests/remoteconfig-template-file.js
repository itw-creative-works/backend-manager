const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const path = require('path');
const chalk = require('chalk');

class RemoteconfigTemplateFileTest extends BaseTest {
  getName() {
    return 'update remoteconfig template file';
  }

  async run() {
    const self = this.self;
    const exists = jetpack.exists(`${self.firebaseProjectPath}/functions/remoteconfig.template.json`);
    return exists;
  }

  async fix() {
    const self = this.self;
    const name = 'remoteconfig.template.json';
    const filePath = `${self.firebaseProjectPath}/functions/${name}`;
    const exists = jetpack.exists(filePath);
    let contents = jetpack.read(filePath) || '';

    if (!exists) {
      console.log(chalk.yellow(`Writing new ${name} file...`));
      jetpack.write(filePath, jetpack.read(path.resolve(`${__dirname}/../../../../templates/${name}`)));
      contents = jetpack.read(filePath) || '';
    }
  }
}

module.exports = RemoteconfigTemplateFileTest;
