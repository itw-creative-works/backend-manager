const BaseCommand = require('./base-command');
const chalk = require('chalk');
const os = require('os');
const powertools = require('node-powertools');

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
    await this.uninstallPkg('backend-manager');
    await this.installPkg('backend-manager');
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