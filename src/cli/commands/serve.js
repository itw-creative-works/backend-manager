const BaseCommand = require('./base-command');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk').default;
const powertools = require('node-powertools');
const WatchCommand = require('./watch');

class ServeCommand extends BaseCommand {
  async execute() {
    const self = this.main;
    const projectDir = self.firebaseProjectPath;
    const firebaseConfig = JSON.parse(fs.readFileSync(path.join(projectDir, 'firebase.json'), 'utf8'));
    const port = self.argv.port || self.argv?._?.[1] || firebaseConfig?.emulators?.hosting?.port || '5000';

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

    // Set up log file in the project directory.
    // Mirrors the emulator.js pattern: the file is truncated on boot and on every
    // hot reload. Two reset signals are honored:
    //   1. Sentinel file (serve.log.reset) — used by the BEM watcher when source
    //      changes in backend-manager itself trigger a reload.
    //   2. Reload marker on stdout (`Using node@22 from host.`) — catches reloads
    //      triggered by firebase serve's own internal watcher (any change inside
    //      the consumer's functions/ directory). MUST be the line firebase-tools
    //      prints at the START of each reload cycle, not somewhere in the middle.
    //      If we rolled mid-cycle (e.g. on "Loaded functions definitions"), the
    //      tail of the reload sequence still gets captured into the fresh log;
    //      but firebase serve sometimes only emits the trailing function-initialized
    //      lines on the first cycle (subsequent cycles route those elsewhere), so
    //      we'd end up with a near-empty log. Rolling at the START of the cycle
    //      lets us capture whatever firebase-tools does emit, complete-or-not.
    const logPath = path.join(projectDir, 'functions', 'serve.log');
    const resetSentinelPath = `${logPath}.reset`;
    // Match any node version: "Using node@22 from host.", "Using node@20 from host.", etc.
    const RELOAD_MARKER = /Using node@\d+ from host\./;
    const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    let currentStream = fs.createWriteStream(logPath, { flags: 'w' });
    let reloadCount = 0; // skip rolling on the first marker (initial boot, not a reload)

    function rollLog() {
      try {
        const oldStream = currentStream;
        currentStream = fs.createWriteStream(logPath, { flags: 'w' });
        oldStream.end();
      } catch (e) {
        // Best-effort. If roll fails, serve keeps running with the existing stream.
      }
    }

    function writeToLog(data) {
      if (currentStream && !currentStream.destroyed) {
        currentStream.write(stripAnsi(data.toString()));
      }
    }

    // Clean up any stale sentinel from a prior crashed serve run
    try { fs.unlinkSync(resetSentinelPath); } catch (e) { /* not present, ok */ }

    // Poll every 500ms for the reset sentinel — cheap, no fs.watch quirks
    const resetWatcher = setInterval(() => {
      if (!fs.existsSync(resetSentinelPath)) {
        return;
      }

      try {
        rollLog();
        fs.unlinkSync(resetSentinelPath);
      } catch (e) {
        // Best-effort.
      }
    }, 500);

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
        // Tee stdout to both console and log file (strip ANSI codes for clean log).
        // Watch each chunk for the reload marker — when seen (after the initial boot),
        // roll the log BEFORE writing this chunk so the marker becomes the first
        // line of the fresh file.
        child.stdout.on('data', (data) => {
          process.stdout.write(data);
          const text = data.toString();
          if (RELOAD_MARKER.test(text)) {
            reloadCount++;
            if (reloadCount > 1) {
              rollLog();
            }
          }
          writeToLog(data);
        });

        // Tee stderr to both console and log file (strip ANSI codes for clean log)
        child.stderr.on('data', (data) => {
          process.stderr.write(data);
          writeToLog(data);
        });

        // Clean up log stream + watcher when child exits
        child.on('close', () => {
          clearInterval(resetWatcher);
          if (currentStream && !currentStream.destroyed) {
            currentStream.end();
          }
          try { fs.unlinkSync(resetSentinelPath); } catch (e) { /* ok */ }
        });
      });
    } catch (error) {
      // User pressed Ctrl+C - this is expected
      this.log(chalk.gray('\n  Server stopped.\n'));
    }
  }
}

module.exports = ServeCommand;
