const BaseCommand = require('./base-command');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const powertools = require('node-powertools');
const WatchCommand = require('./watch');

class ServeCommand extends BaseCommand {
  async execute() {
    const self = this.main;
    const port = self.argv.port || self.argv?._?.[1] || '5000';
    const projectDir = self.firebaseProjectPath;

    // Check for port conflicts before starting server
    const canProceed = await this.checkAndKillBlockingProcesses({ serving: parseInt(port, 10) });
    if (!canProceed) {
      throw new Error('Port conflicts could not be resolved');
    }

    // Start BEM watcher in background
    const watcher = new WatchCommand(self);
    watcher.startBackground();

    // Start Stripe webhook forwarding in background
    this.startStripeWebhookForwarding();

    // Set up log file in the project directory
    const logPath = path.join(projectDir, 'functions', 'serve.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'w' });
    const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    this.log(chalk.gray(`  Logs saving to: ${logPath}\n`));

    // Execute with tee to log file
    try {
      await powertools.execute(`firebase serve --port ${port}`, {
        log: false,
        cwd: projectDir,
        config: {
          stdio: ['inherit', 'pipe', 'pipe'],
          env: { ...process.env, FORCE_COLOR: '1' },
        },
      }, (child) => {
        // Tee stdout to both console and log file (strip ANSI codes for clean log)
        child.stdout.on('data', (data) => {
          process.stdout.write(data);
          logStream.write(stripAnsi(data.toString()));
        });

        // Tee stderr to both console and log file (strip ANSI codes for clean log)
        child.stderr.on('data', (data) => {
          process.stderr.write(data);
          logStream.write(stripAnsi(data.toString()));
        });

        // Clean up log stream when child exits
        child.on('close', () => {
          logStream.end();
        });
      });
    } catch (error) {
      // User pressed Ctrl+C - this is expected
      this.log(chalk.gray('\n  Server stopped.\n'));
    }
  }
}

module.exports = ServeCommand;
