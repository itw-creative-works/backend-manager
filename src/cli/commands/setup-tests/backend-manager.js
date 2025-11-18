const BaseTest = require('./base-test');
const chalk = require('chalk');
const wonderfulVersion = require('wonderful-version');
const powertools = require('node-powertools');
const Npm = require('npm-api');
const helpers = require('./helpers');

class BackendManagerTest extends BaseTest {
  getName() {
    return 'using updated backend-manager';
  }

  async run() {
    const pkg = 'backend-manager';
    const latest = await this.getPkgVersion(pkg);
    const mine = this.context.package.dependencies[pkg];

    // Get level difference
    const levelDifference = wonderfulVersion.levelDifference(latest, mine);

    // Log if major version mismatch
    if (!helpers.isLocal(mine) && levelDifference === 'major') {
      console.log(chalk.red(`Version ${chalk.bold(latest)} of ${chalk.bold(pkg)} available but you must install this manually because it is a major update.`));
    }

    // Ensure the version is up to date
    return helpers.isLocal(mine) || wonderfulVersion.is(mine, '>=', latest) || levelDifference === 'major';
  }

  async fix() {
    await this.installPkg('backend-manager');

    console.log(chalk.green(`Process has exited since a new version of backend-manager was installed. Run ${chalk.bold('npx bm setup')} again.`));
    process.exit(0);
  }

  async getPkgVersion(packageName) {
    const npm = new Npm();

    return new Promise((resolve, reject) => {
      npm.repo(packageName)
        .package()
        .then(function(pkg) {
          resolve(pkg.version);
        }, function(err) {
          resolve('0.0.0');
        });
    });
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

module.exports = BackendManagerTest;
