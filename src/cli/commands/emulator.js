const BaseCommand = require('./base-command');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const chalk = require('chalk').default;
const jetpack = require('fs-jetpack');
const JSON5 = require('json5');
const WatchCommand = require('./watch');
const { DEFAULT_EMULATOR_PORTS } = require('./setup-tests/emulator-config');
const { EXTENDED_MODE_WARNING } = require('../../test/utils/extended-mode-warning');
const { writeTestMode, captureSyncedEnv } = require('../../test/utils/test-mode-file');

// Used by both `npx mgr emulator` and `npx mgr test` auto-start path.
// Note: `emulators:start` enables the UI by default (controlled by firebase.json's
// `emulators.ui.enabled`), so no `--ui` flag here — that flag only exists on `:exec`.
const EMULATOR_FLAGS = '--only functions,firestore,auth,database,hosting,pubsub';

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

    // Keep-alive: boot emulators and wait for Ctrl+C. No "command" subprocess —
    // the emulator child IS the foreground process from the user's perspective.
    try {
      const { shutdown, exitPromise } = await this.startEmulators();

      this.log(chalk.gray('\n  Emulator ready. Press Ctrl+C to shut down...\n'));

      const onSigint = async () => {
        this.log(chalk.gray('\n  Shutting down emulator...'));
        await shutdown();
        this.log(chalk.gray('  Emulator stopped.\n'));
        process.exit(0);
      };
      process.once('SIGINT', onSigint);

      // Resolve if the emulator dies on its own (crash, port conflict, etc.)
      await exitPromise;
      process.removeListener('SIGINT', onSigint);
      this.log(chalk.gray('\n  Emulator stopped.\n'));
    } catch (error) {
      this.logError(`Emulator error: ${error.message || error}`);
      process.exit(1);
    }
  }

  /**
   * Boot Firebase emulators as a long-running child process.
   * Stdout/stderr are teed to console + emulator.log.
   * Resolves once the emulator hub is listening (i.e., emulators are ready).
   * Caller is responsible for calling shutdown() to send SIGTERM and wait for exit.
   *
   * @returns {Promise<{ child: ChildProcess, shutdown: () => Promise<void>, emulatorPorts: object }>}
   */
  async startEmulators() {
    const projectDir = this.main.firebaseProjectPath;

    // Load emulator ports from firebase.json
    const emulatorPorts = this.loadEmulatorPorts(projectDir);

    // Check for port conflicts before starting emulator
    const canProceed = await this.checkAndKillBlockingProcesses(emulatorPorts);
    if (!canProceed) {
      throw new Error('Port conflicts could not be resolved');
    }

    // Wipe stale firebase-tools debug logs + any leftover BEM logs from older versions.
    this.sweepStaleLogs();

    // Set up log file + reset-sentinel watcher.
    // Mutable `currentStream` so the test command can request a fresh log by touching
    // emulator.log.reset — the watcher detects it, closes the current stream, and
    // reopens with flags: 'w' (truncating cleanly from our process' perspective).
    const logPath = this.getLogsPath('emulator.log');
    const resetSentinelPath = this.getTempPath('emulator.log.reset');
    const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    let currentStream = fs.createWriteStream(logPath, { flags: 'w' });

    function writeToLog(data) {
      if (currentStream && !currentStream.destroyed) {
        currentStream.write(stripAnsi(data.toString()));
      }
    }

    // Clean up any stale sentinel from a prior crashed run
    try { fs.unlinkSync(resetSentinelPath); } catch (e) { /* not present, ok */ }

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

    this.log(chalk.gray(`  Logs saving to: ${logPath}`));

    // BEM_TESTING=true is passed so Functions skip external API calls (emails, SendGrid)
    // hosting is included so localhost:5002 rewrites work (e.g., /backend-manager -> bm_api)
    // pubsub is included so scheduled functions (bm_cronDaily) can be triggered in tests
    const env = {
      ...process.env,
      FORCE_COLOR: '1',
      BEM_TESTING: 'true',
    };

    // Spawn `firebase emulators:start` as a background child. Use `sh -c` so the
    // user's shell PATH resolves `firebase` consistently with the interactive shell.
    //
    // `detached: true` puts the child into its own process group. We need this so that
    // shutdown() can kill the entire group (sh → firebase → java emulators) by
    // signalling the negative pgid. Without it, SIGTERM to the shell doesn't propagate
    // to firebase or its java grandchildren, leaving orphan firestore/pubsub processes.
    const child = spawn('sh', ['-c', `firebase emulators:start ${EMULATOR_FLAGS}`], {
      cwd: projectDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    // Wire readiness detection into the stdout/stderr handlers.
    //
    // We watch for firebase-tools' explicit "All emulators ready!" line — that's the
    // signal that function discovery + load is complete and the runtime can serve HTTP.
    // Port-listening alone isn't enough: firebase-tools binds the functions socket
    // ~5-10s before user functions are actually loadable, so HTTP requests fail with
    // ECONNREFUSED / "fetch failed" if we proceed when only the port is open.
    let readyResolve;
    let readyReject;
    const readyPromise = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    let ready = false;
    const READY_MARKER = /All emulators ready/i;

    child.stdout.on('data', (data) => {
      process.stdout.write(data);
      writeToLog(data);
      if (!ready && READY_MARKER.test(data.toString())) {
        ready = true;
        readyResolve();
      }
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data);
      writeToLog(data);
      // firebase-tools prints the ready line to stderr sometimes — watch both.
      if (!ready && READY_MARKER.test(data.toString())) {
        ready = true;
        readyResolve();
      }
    });

    // Track exit state so shutdown() can resolve when the process is gone
    let exitPromiseResolve;
    const exitPromise = new Promise((resolve) => {
      exitPromiseResolve = resolve;
    });

    child.on('close', (code, signal) => {
      clearInterval(resetWatcher);
      if (currentStream && !currentStream.destroyed) {
        currentStream.end();
      }
      try { fs.unlinkSync(resetSentinelPath); } catch (e) { /* ok */ }
      exitPromiseResolve({ code, signal });
      // If we exited before becoming ready, fail the readiness wait too
      if (!ready) {
        readyReject(new Error(`Emulator child exited before ready (code=${code}, signal=${signal})`));
      }
    });

    // Race the readiness marker against a 60s timeout
    const readyTimeoutMs = 60000;
    await Promise.race([
      readyPromise,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(`Emulator did not print "All emulators ready" within ${readyTimeoutMs}ms`)),
        readyTimeoutMs,
      )),
    ]);

    // shutdown() signals the entire emulator process group (sh + firebase + java
    // grandchildren), waits up to 10s for clean exit, then escalates to SIGKILL.
    //
    // We use `process.kill(-pgid, ...)` instead of `child.kill(...)` because firebase
    // tools spawns several Java subprocesses (firestore + pubsub) that survive if
    // only the sh wrapper is killed. The negative PID targets the whole process group
    // (made possible by `detached: true` above).
    const killGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch (e) {
        // ESRCH = group already dead, that's fine
        if (e.code !== 'ESRCH') throw e;
      }
    };

    const shutdown = async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return; // already gone
      }

      killGroup('SIGTERM');

      const killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          killGroup('SIGKILL');
        }
      }, 10000);

      await exitPromise;
      clearTimeout(killTimer);
    };

    return { child, shutdown, emulatorPorts, exitPromise };
  }

  /**
   * Boot emulators and run a single command against them. Sends SIGTERM to the emulator
   * when the command exits (or this process is interrupted) and waits for clean shutdown.
   *
   * Used by `npx mgr emulator` for the keep-alive flow (command is a no-op sleep).
   * `npx mgr test`'s auto-start path uses startEmulators() directly so it can tee the
   * test command's output to its own log (test.log) separate from emulator.log.
   *
   * @param {string} command - shell command to run while emulators are up
   */
  async runWithEmulator(command) {
    const { shutdown, exitPromise } = await this.startEmulators();

    // SIGINT (Ctrl+C) → graceful shutdown
    const onSigint = async () => {
      await shutdown();
      process.exit(0);
    };
    process.once('SIGINT', onSigint);

    try {
      // Run the user command; when it exits we tear down the emulator.
      const cmdChild = spawn('sh', ['-c', command], {
        cwd: this.main.firebaseProjectPath,
        env: { ...process.env, FORCE_COLOR: '1' },
        stdio: 'inherit',
      });

      const cmdExit = await new Promise((resolve) => {
        cmdChild.on('close', (code, signal) => resolve({ code, signal }));
      });

      process.removeListener('SIGINT', onSigint);
      await shutdown();
      await exitPromise;

      if (cmdExit.code !== 0) {
        throw Object.assign(new Error(`Command exited with code ${cmdExit.code}`), { code: cmdExit.code });
      }
    } catch (e) {
      process.removeListener('SIGINT', onSigint);
      await shutdown();
      throw e;
    }
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
