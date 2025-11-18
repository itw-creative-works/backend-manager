const BaseTest = require('./base-test');
const chalk = require('chalk');
const wonderfulVersion = require('wonderful-version');

class NodeVersionTest extends BaseTest {
  getName() {
    return `using at least Node.js v${this.context.packageJSON.engines.node}`;
  }

  async run() {
    const engineReqVer = this.context.packageJSON.engines.node;
    const engineHasVer = this.context.package.engines.node;
    const processVer = process.versions.node;

    // Check if the process version is less than the required version
    if (wonderfulVersion.is(processVer, '<', engineReqVer)) {
      return new Error(`Please use at least version ${engineReqVer} of Node.js with this project. You need to update your package.json and your .nvmrc file. Then, make sure to run ${chalk.bold(`nvm use ${engineReqVer}`)}`);
    }

    // Check if the engine version is less than the required version
    if (!wonderfulVersion.is(engineHasVer, '===', engineReqVer)) {
      console.log(chalk.yellow(`You are using Node.js version ${processVer} but this project suggests ${engineReqVer}.`));
    }

    // Return
    return wonderfulVersion.is(engineHasVer, '>=', engineReqVer);
  }

  async fix() {
    throw new Error('Please manually fix your outdated Node.js version (either .nvmrc or package.json engines.node).');
  }
}

module.exports = NodeVersionTest;
