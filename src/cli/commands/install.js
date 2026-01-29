const BaseCommand = require('./base-command');
const chalk = require('chalk');
const os = require('os');
const powertools = require('node-powertools');
const Npm = require('npm-api');
const jetpack = require('fs-jetpack');
const wonderfulVersion = require('wonderful-version');

class InstallCommand extends BaseCommand {
  async execute(type) {
    if (type === 'local' || type === 'dev' || type === 'development') {
      await this.installLocal();
    } else if (type === 'live' || type === 'prod' || type === 'production') {
      await this.installLive();
    }
  }

  async installLocal() {
    await this.uninstallPkg('backend-manager');
    await this.installPkg(`npm install ${os.homedir()}/Developer/Repositories/ITW-Creative-Works/backend-manager`);
  }

  async installLive() {
    // Check and update peer dependencies before installing
    await this.updatePeerDependencies();

    await this.uninstallPkg('backend-manager');
    await this.installPkg('backend-manager');
  }

  async updatePeerDependencies() {
    // Fetch latest backend-manager package info from npm
    const latestBem = await this.getPackageInfo('backend-manager');
    if (!latestBem || !latestBem.peerDependencies) {
      this.logWarning('Could not fetch backend-manager peer dependencies, proceeding anyway...');
      return;
    }

    // Read project's package.json
    const projectPkgPath = `${this.firebaseProjectPath}/functions/package.json`;
    const projectPkg = jetpack.read(projectPkgPath, 'json');
    if (!projectPkg || !projectPkg.dependencies) {
      this.logWarning('Could not read project package.json, proceeding anyway...');
      return;
    }

    // Check each peer dependency
    const peerDeps = ['firebase-admin', 'firebase-functions'];
    const outdatedDeps = [];

    for (const dep of peerDeps) {
      const required = latestBem.peerDependencies[dep];
      const installed = projectPkg.dependencies[dep];

      if (!required || !installed) {
        continue;
      }

      // Check if installed version meets the requirement
      const meetsRequirement = wonderfulVersion.is(installed, '>=', required);
      const levelDifference = wonderfulVersion.levelDifference(required, installed);

      if (!meetsRequirement) {
        outdatedDeps.push({
          name: dep,
          installed,
          required,
          isMajor: levelDifference === 'major',
        });
      }
    }

    // If no outdated deps, we're good
    if (outdatedDeps.length === 0) {
      return;
    }

    // Log and update each dependency
    this.log(chalk.yellow('\nUpdating peer dependencies for backend-manager...'));
    for (const dep of outdatedDeps) {
      const majorWarning = dep.isMajor ? chalk.red(' (major update)') : '';
      this.log(`  ${chalk.bold(dep.name)}: ${dep.installed} → ${dep.required}${majorWarning}`);
      await this.installPkg(dep.name, `@${dep.required}`);
    }

    this.log(chalk.green('Peer dependencies updated successfully!\n'));
  }

  async getPackageInfo(packageName) {
    const npm = new Npm();

    return new Promise((resolve) => {
      npm.repo(packageName)
        .package()
        .then((pkg) => {
          resolve(pkg);
        })
        .catch(() => {
          resolve(null);
        });
    });
  }

  async installPkg(name, version, type) {
    let v;
    let t;
    
    if (typeof name === 'string' && name.startsWith('npm install')) {
      // Full npm install command passed
      const command = name;
      this.log('Running ', command);
      
      return await powertools.execute(command, { log: true })
        .catch((e) => {
          throw e;
        });
    }
    
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

    const command = `npm i ${name}${v}${t}`;
    this.log('Running ', command);

    return await powertools.execute(command, { log: true })
      .catch((e) => {
        throw e;
      });
  }

  async uninstallPkg(name) {
    const command = `npm uninstall ${name}`;
    this.log('Running ', command);

    return await powertools.execute(command, { log: true })
      .catch((e) => {
        throw e;
      });
  }
}

module.exports = InstallCommand;