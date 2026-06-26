const BaseCommand = require('./base-command');
const chalk = require('chalk').default;
const powertools = require('node-powertools');
const attachLogFile = require('../utils/attach-log-file');

class DeployCommand extends BaseCommand {
  async execute() {
    const self = this.main;

    // Quick check that not using local packages
    const allDeps = JSON.stringify(self.packageJSON.dependencies || {}) + JSON.stringify(self.packageJSON.devDependencies || {});
    if (allDeps.includes('file:')) {
      this.logError(`Please remove local packages before deploying!`);
      return;
    }

    const logPath = this.getLogsPath('deploy.log');
    attachLogFile(logPath);
    this.log(chalk.gray(`  Logs saving to: ${logPath}\n`));

    try {
      await powertools.execute('firebase deploy', {
        log: false,
        config: {
          cwd: self.firebaseProjectPath,
          stdio: ['inherit', 'pipe', 'pipe'],
          env: { ...process.env, FORCE_COLOR: '1' },
        },
      }, (child) => {
        child.stdout.on('data', (data) => process.stdout.write(data));
        child.stderr.on('data', (data) => process.stderr.write(data));
      });
    } finally {
      await attachLogFile.detach();
    }
  }
}

module.exports = DeployCommand;