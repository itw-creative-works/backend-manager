const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const chalk = require('chalk');
const wonderfulVersion = require('wonderful-version');

class NvmrcVersionTest extends BaseTest {
  getName() {
    return '.nvmrc file has proper version';
  }

  async run() {
    const engineReqVer = this.context.packageJSON.engines.node;
    const nvmrcVer = jetpack.read(`${this.self.firebaseProjectPath}/functions/.nvmrc`);

    // Check to ensure nvmrc is greater than or equal to the engine version
    return wonderfulVersion.is(nvmrcVer, '>=', engineReqVer);
  }

  async fix() {
    const v = this.context.packageJSON.engines.node;

    jetpack.write(`${this.self.firebaseProjectPath}/functions/.nvmrc`, `v${v}/*`);

    console.log(chalk.red(`Please run ${chalk.bold(`nvm use ${v}`)} to use the correct version of Node.js`));

    throw new Error('');
  }
}

module.exports = NvmrcVersionTest;
