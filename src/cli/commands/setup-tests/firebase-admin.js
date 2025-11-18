const BaseTest = require('./base-test');
const chalk = require('chalk');
const wonderfulVersion = require('wonderful-version');
const powertools = require('node-powertools');
const helpers = require('./helpers');

class FirebaseAdminTest extends BaseTest {
  getName() {
    return 'using updated firebase-admin';
  }

  async run() {
    const pkg = 'firebase-admin';
    const latest = this.context.packageJSON.dependencies['firebase-admin'];
    const mine = this.context.package.dependencies[pkg];
    const bemv = this.context.packageJSON.dependencies[pkg];

    // Get level difference
    const levelDifference = wonderfulVersion.levelDifference(latest, mine);

    // Log
    this.bemPackageVersionWarning(pkg, bemv, latest);

    // Log if major version mismatch
    if (levelDifference === 'major') {
      console.log(chalk.red(`Version ${chalk.bold(latest)} of ${chalk.bold(pkg)} available but you must install this manually because it is a major update.`));
    }

    // Ensure the version is up to date
    return wonderfulVersion.is(mine, '>=', latest) || levelDifference === 'major';
  }

  async fix() {
    await this.installPkg('firebase-admin', `@${this.context.packageJSON.dependencies['firebase-admin']}`);
  }

  bemPackageVersionWarning(packageName, current, latest) {
    if (wonderfulVersion.greaterThan(latest, current)) {
      console.log(chalk.yellow(`${packageName} needs to be updated in backend-manager: ${current} => ${latest}`));
    }
  }

  async installPkg(name, version, type) {
    let v;
    let t;
    if (name.indexOf('file:') > -1) {
      v = '';
    } else if (!version) {
      v = '@latest';
    } else {
      v = version;
    }

    if (!type) {
      t = '';
    } else if (type === 'dev' || type === '--save-dev') {
      t = ' --save-dev';
    }

    // Build the command
    const command = `npm i ${name}${v}${t}`;

    // Log
    console.log('Running ', command);

    // Execute
    await powertools.execute(command, { log: true });
  }
}

module.exports = FirebaseAdminTest;
