const BaseCommand = require('./base-command');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk').default;
const jetpack = require('fs-jetpack');
const JSON5 = require('json5');
const powertools = require('node-powertools');
const WatchCommand = require('./watch');
const { DEFAULT_EMULATOR_PORTS } = require('./setup-tests/emulator-config');
const { EXTENDED_MODE_WARNING } = require('../../test/utils/extended-mode-warning');
const { writeTestMode, captureSyncedEnv } = require('../../test/utils/test-mode-file');

class EmulatorCommand extends BaseCommand {
  async execute() {
    this.log(chalk.cyan('\n  Starting Firebase emulator (keep-alive mode)...\n'));
    this.log(chalk.gray('  Emulator will stay running until you press Ctrl+C\n'));

    // Boot-time: seed the shared state file with whatever this emulator was
    // started with. Two flows are supported:
    //   - Recommended: start emulator without the flag, set TEST_EXTENDED_MODE
    //     on `npx mgr test` instead. The test command writes the file; the
    //     emulator's function workers watch it and flip live.
    //   - Also supported: start emulator with TEST_EXTENDED_MODE=true. We
    //     write the file here as a boot default. Useful for inspecting the
    //     emulator before any tests fire. Note: the next `npx mgr test`
    //     overwrites the file regardless of how the emulator booted.
    {
      const projectDir = this.main.firebaseProjectPath;
      const envSubset = captureSyncedEnv(process.env);
      writeTestMode(projectDir, envSubset);
    }

    // Show the standard warning if the emulator boots in extended mode.
    if (process.env.TEST_EXTENDED_MODE) {
      this.log(chalk.yellow.bold(`\n  ${EXTENDED_MODE_WARNING[0]}`));
      EXTENDED_MODE_WARNING.slice(1).forEach((line) => this.log(chalk.yellow(`  ${line}`)));
      this.log(chalk.gray(`  (Tip: you can also flip mode per-run by setting TEST_EXTENDED_MODE on \`npx mgr test\`.)`));
      this.log('');
    }

    // Start BEM watcher in background
    const watcher = new WatchCommand(this.main);
    watcher.startBackground();

    // Start Stripe webhook forwarding in background
    this.startStripeWebhookForwarding();

    // Run emulator with keep-alive command (use single quotes since runWithEmulator wraps in double quotes)
    const keepAliveCommand = "echo ''; echo 'Emulator ready. Press Ctrl+C to shut down...'; sleep 86400";

    try {
      await this.runWithEmulator(keepAliveCommand);
    } catch (error) {
      // User pressed Ctrl+C - this is expected
      this.log(chalk.gray('\n  Emulator stopped.\n'));
    }
  }

  /**
   * Run a command with Firebase emulator
   * @param {string} command - The command to execute inside the Firebase emulator
   * @returns {Promise<void>}
   */
  async runWithEmulator(command) {
    const projectDir = this.main.firebaseProjectPath;

    // Load emulator ports from firebase.json
    const emulatorPorts = this.loadEmulatorPorts(projectDir);

    // Check for port conflicts before starting emulator
    const canProceed = await this.checkAndKillBlockingProcesses(emulatorPorts);
    if (!canProceed) {
      throw new Error('Port conflicts could not be resolved');
    }

    // BEM_TESTING=true is passed so Functions skip external API calls (emails, SendGrid)
    // hosting is included so localhost:5002 rewrites work (e.g., /backend-manager -> bm_api)
    // pubsub is included so scheduled functions (bm_cronDaily) can be triggered in tests
    // Use double quotes for command wrapper since the command may contain single quotes (JSON strings)
    const envPrefix = process.env.TEST_EXTENDED_MODE
      ? 'BEM_TESTING=true TEST_EXTENDED_MODE=true'
      : 'BEM_TESTING=true';
    const emulatorCommand = `${envPrefix} firebase emulators:exec --only functions,firestore,auth,database,hosting,pubsub --ui "${command}"`;

    // Set up log file in the project directory.
    // We use a mutable `currentStream` so the test command can request a fresh log
    // by touching emulator.log.reset — the watcher below detects it, closes the
    // current stream, reopens with flags: 'w' (truncating cleanly from our process'
    // perspective, no sparse-file issue), and deletes the sentinel.
    const logPath = path.join(projectDir, 'functions', 'emulator.log');
    const resetSentinelPath = `${logPath}.reset`;
    const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    let currentStream = fs.createWriteStream(logPath, { flags: 'w' });

    function writeToLog(data) {
      if (currentStream && !currentStream.destroyed) {
        currentStream.write(stripAnsi(data.toString()));
      }
    }

    // Clean up any stale sentinel from a prior crashed emulator run
    try { fs.unlinkSync(resetSentinelPath); } catch (e) { /* not present, ok */ }

    // Watch for the test command's request to roll the log.
    // Poll every 500ms — cheap, no fs.watch quirks across platforms.
    const resetWatcher = setInterval(() => {
      if (!fs.existsSync(resetSentinelPath)) {
        return;
      }

      try {
        const oldStream = currentStream;
        currentStream = fs.createWriteStream(logPath, { flags: 'w' });
        oldStream.end();
        fs.unlinkSync(resetSentinelPath);
      } catch (e) {
        // Best-effort. If reset fails the test still runs, the log just won't be fresh.
      }
    }, 500);

    // Write pre-emulator info to log file
    if (process.env.TEST_EXTENDED_MODE) {
      EXTENDED_MODE_WARNING.forEach((line) => writeToLog(`${line}\n`));
      writeToLog('\n');
    }

    this.log(chalk.gray(`  Logs saving to: ${logPath}\n`));

    await powertools.execute(emulatorCommand, {
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
  }

  /**
   * Load emulator ports from firebase.json or use defaults
   */
  loadEmulatorPorts(projectDir) {
    const emulatorPorts = { ...DEFAULT_EMULATOR_PORTS };
    const firebaseJsonPath = path.join(projectDir, 'firebase.json');

    if (jetpack.exists(firebaseJsonPath)) {
      try {
        const firebaseConfig = JSON5.parse(jetpack.read(firebaseJsonPath));
        if (firebaseConfig.emulators) {
          for (const name of Object.keys(DEFAULT_EMULATOR_PORTS)) {
            emulatorPorts[name] = firebaseConfig.emulators[name]?.port || DEFAULT_EMULATOR_PORTS[name];
          }
        }
      } catch (error) {
        this.logWarning(`Warning: Could not parse firebase.json: ${error.message}`);
      }
    }

    return emulatorPorts;
  }
}

module.exports = EmulatorCommand;
