const chalk = require('chalk').default;
const { confirm } = require('@inquirer/prompts');
const { execSync, spawn } = require('child_process');
const path = require('path');
const jetpack = require('fs-jetpack');
const ui = require('../utils/ui');

class BaseCommand {
  constructor(main) {
    this.main = main;
    this.firebaseProjectPath = main.firebaseProjectPath;
    this.argv = main.argv;
    this.options = main.options;
    // Shared OMEGA-style CLI styling helpers (dividers, headers, status lines).
    // See src/cli/utils/ui.js. Use `this.ui.*` in any command for consistent output.
    this.ui = ui;
  }

  async execute() {
    throw new Error('Execute method must be implemented');
  }

  /**
   * Resolve a path inside the consumer project's `.temp/` directory. Used for
   * TRULY internal artifacts that have no debugging value: reset sentinels
   * (*.log.reset), the watch command's reload trigger, and `test-mode.json`.
   *
   * For human-readable log files, use `getLogsPath()` instead — those live in
   * `functions/` next to firebase-tools' own *-debug.log files so all log
   * output can be grepped from one directory.
   *
   * Ensures the directory exists.
   * @param {string} [filename] - File name to append (omit to get the dir path).
   * @returns {string} Absolute path.
   */
  getTempPath(filename) {
    const projectDir = this.main.firebaseProjectPath;
    const tempDir = path.join(projectDir, '.temp');
    jetpack.dir(tempDir);
    return filename ? path.join(tempDir, filename) : tempDir;
  }

  /**
   * Resolve a path for a human-readable log file. BEM-owned logs (dev.log,
   * emulator.log, test.log, production.log) live in `functions/` alongside
   * firebase-tools' own *-debug.log files so all log output is grep-able from
   * one place. Reset sentinels and other internal-only artifacts use
   * `getTempPath()` instead.
   *
   * @param {string} [filename] - File name to append (omit to get the dir path).
   * @returns {string} Absolute path.
   */
  getLogsPath(filename) {
    const projectDir = this.main.firebaseProjectPath;
    const logsDir = path.join(projectDir, 'functions');
    return filename ? path.join(logsDir, filename) : logsDir;
  }

  /**
   * Sweep stale BEM-owned logs out of `functions/`. Catches `.log` files
   * from previous runs so each emulator/serve/test boot starts with a clean
   * slate. Also catches stale `.reset` sentinels in `.temp/` that a crashed
   * process may have left behind.
   *
   * Firebase-tools writes its own debug logs (firestore-debug.log,
   * database-debug.log, pubsub-debug.log, firebase-debug.log, ui-debug.log) to
   * cwd and we can't redirect them — we deliberately do NOT touch those, so
   * users can grep them after a crash.
   */
  sweepStaleLogs() {
    const logFiles = [
      'dev.log',
      'deploy.log',
      'emulator.log',
      'test.log',
      'production.log',
    ];
    const resetSentinels = [
      'dev.log.reset',
      'emulator.log.reset',
    ];

    for (const name of logFiles) {
      try { jetpack.remove(this.getLogsPath(name)); } catch (e) { /* best-effort */ }
    }
    for (const name of resetSentinels) {
      try { jetpack.remove(this.getTempPath(name)); } catch (e) { /* best-effort */ }
    }
  }

  log(...args) {
    console.log(...args);
  }

  logError(message) {
    console.log(chalk.red(message));
  }

  logSuccess(message) {
    console.log(chalk.green(message));
  }

  logWarning(message) {
    console.log(chalk.yellow(message));
  }

  /**
   * Check for port conflicts and prompt to kill blocking processes
   * @param {object} emulatorPorts - Object with port numbers { functions, firestore, auth }
   * @returns {boolean} - true if we can proceed, false if user aborted
   */
  async checkAndKillBlockingProcesses(emulatorPorts) {
    const portsToCheck = Object.entries(emulatorPorts)
      .filter(([_, port]) => port)
      .map(([name, port]) => ({ name, port }));

    // Collect ALL processes on each blocked port
    const blockedPorts = [];
    for (const { name, port } of portsToCheck) {
      const processes = this.getProcessesOnPort(port);
      if (processes) {
        blockedPorts.push({ name, port, processes });
      }
    }

    if (blockedPorts.length === 0) {
      return true;
    }

    this.log(chalk.yellow('\n  The following ports are in use:'));
    for (const { name, port, processes } of blockedPorts) {
      for (const { pid, processName, command } of processes) {
        const cmdInfo = command ? ` ${command}` : '';
        this.log(chalk.gray(`    - ${name} emulator (port ${port}) - PID ${pid} (${processName})${cmdInfo}`));
      }
    }

    // Non-interactive environments (CI, agents, piped stdin) have no TTY, so inquirer
    // can't read a keypress — prompting would error or hang. Skip the prompt entirely
    // and auto-confirm the kill so unattended `mgr test` / `mgr emulator` runs proceed.
    if (!process.stdin.isTTY) {
      this.log(chalk.gray('  Non-interactive shell — auto-confirming port cleanup (Y).'));
      return this.killBlockingProcesses(blockedPorts);
    }

    // Auto-confirm (Y) after a few seconds of no input so unattended test/dev loops don't
    // hang. When the timeout fires the prompt is aborted via AbortSignal and we fall back to
    // the default (true). inquirer owns the cursor and can't live-update its own message, so
    // the countdown is shown statically in the prompt.
    const AUTO_CONFIRM_SECONDS = 5;
    let shouldKill;
    try {
      shouldKill = await confirm(
        { message: `Kill these processes to free the ports? (auto-Y in ${AUTO_CONFIRM_SECONDS}s)`, default: true },
        { signal: AbortSignal.timeout(AUTO_CONFIRM_SECONDS * 1000) },
      );
    } catch (error) {
      // Any prompt failure → fall back to the safe default (auto-confirm Y) instead of
      // crashing. This covers:
      //   - AbortPromptError: the 5s timeout fired (no input).
      //   - ExitPromptError / force-close: stdin is present but closed/EOF'd (the
      //     case under `mgr test`, agents, and other wrappers that pipe a non-readable
      //     stdin). inquirer throws "User force closed the prompt with 0 null" here.
      // Anything unexpected is logged but still defaults to Y so unattended runs proceed.
      const name = error?.name || '';
      const known = name === 'AbortPromptError' || name === 'ExitPromptError';
      if (!known) {
        this.log(chalk.gray(`  Prompt unavailable (${name || 'unknown'}) — auto-confirming (Y).`));
      } else {
        this.log(chalk.gray('  No input — auto-confirming (Y).'));
      }
      shouldKill = true;
    }

    if (!shouldKill) {
      this.log(chalk.gray('\n  Aborting. Free the ports and try again.\n'));
      return false;
    }

    return this.killBlockingProcesses(blockedPorts);
  }

  /**
   * Kill every process on the given blocked ports, then wait for release.
   * @param {object[]} blockedPorts - [{ name, port, processes: [{ pid }] }]
   * @returns {Promise<boolean>} - true if all killed (or already dead), false on failure
   */
  async killBlockingProcesses(blockedPorts) {
    // Kill ALL processes on each blocked port
    for (const { name, port, processes } of blockedPorts) {
      for (const { pid } of processes) {
        try {
          process.kill(pid, 'SIGKILL');
          this.log(chalk.green(`    ✓ Killed process ${pid} on port ${port} (${name})`));
        } catch (error) {
          // ESRCH means process already dead - that's fine
          if (error.code !== 'ESRCH') {
            this.logError(`    ✗ Failed to kill process ${pid}: ${error.message}`);
            return false;
          }
        }
      }
    }

    // Wait a moment for ports to be released
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  }

  /**
   * Get info about ALL processes using a specific port
   * @param {number} port - Port number to check
   * @returns {object[]|null} - Array of process info if port is in use, null otherwise
   */
  getProcessesOnPort(port) {
    try {
      const result = execSync(`lsof -ti:${port} 2>/dev/null`, { encoding: 'utf8' });
      const pids = result.trim().split('\n')
        .map(line => parseInt(line.trim(), 10))
        .filter(pid => !isNaN(pid));

      if (pids.length === 0) {
        return null;
      }

      // Get unique PIDs (lsof can return duplicates for multiple connections)
      const uniquePids = [...new Set(pids)];

      const processes = uniquePids.map(pid => {
        let processName = 'unknown';
        let command = '';
        try {
          const psResult = execSync(`ps -p ${pid} -o comm=,args= 2>/dev/null`, { encoding: 'utf8' });
          const parts = psResult.trim().split(/\s+/);
          processName = parts[0] || 'unknown';
          command = parts.slice(1).join(' ').substring(0, 100);
          if (command.length === 100) {
            command += '...';
          }
        } catch (e) {
          // Ignore - just use defaults
        }
        return { pid, processName, command };
      });

      return processes.length > 0 ? processes : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get info about a process using a specific port (returns first process only for backwards compatibility)
   * @param {number} port - Port number to check
   * @returns {object|null} - Process info if port is in use, null otherwise
   */
  getProcessOnPort(port) {
    const processes = this.getProcessesOnPort(port);
    return processes ? processes[0] : null;
  }

  /**
   * Check if a port is in use
   * @param {number} port - Port number to check
   * @returns {boolean} - true if port is in use
   */
  isPortInUse(port) {
    return this.getProcessOnPort(port) !== null;
  }

  /**
   * Start Stripe CLI webhook forwarding in the background
   * Forwards Stripe test webhooks to the local server
   * Gracefully skips if stripe CLI or STRIPE_SECRET_KEY is missing
   * @returns {object|null} - Child process handle or null if skipped
   */
  startStripeWebhookForwarding() {
    const projectDir = this.main.firebaseProjectPath;
    const functionsDir = path.join(projectDir, 'functions');

    // Quit early here because its not supported yet
    this.log(chalk.gray('  (Stripe webhook forwarding is currently disabled - coming soon!)\n'));
    return null;

    // Load .env so STRIPE_SECRET_KEY and BACKEND_MANAGER_WEBHOOK_KEY are available
    const envPath = path.join(functionsDir, '.env');
    if (jetpack.exists(envPath)) {
      require('dotenv').config({ path: envPath, quiet: true });
    }

    // Check for Stripe secret key
    if (!process.env.STRIPE_SECRET_KEY) {
      this.log(chalk.gray('  (Stripe webhook forwarding disabled - STRIPE_SECRET_KEY not set in .env)\n'));
      return null;
    }

    // Check for Backend Manager webhook key
    if (!process.env.BACKEND_MANAGER_WEBHOOK_KEY) {
      this.log(chalk.gray('  (Stripe webhook forwarding disabled - BACKEND_MANAGER_WEBHOOK_KEY not set in .env)\n'));
      return null;
    }

    // Check if stripe CLI is installed
    let stripePath;
    try {
      stripePath = execSync('which stripe', { encoding: 'utf8' }).trim();
    } catch (e) {
      this.log(chalk.gray('  (Stripe webhook forwarding disabled - install Stripe CLI: https://stripe.com/docs/stripe-cli)\n'));
      return null;
    }

    // Resolve hosting port from firebase.json (default 5002)
    let hostingPort = 5002;
    const firebaseJsonPath = path.join(projectDir, 'firebase.json');
    if (jetpack.exists(firebaseJsonPath)) {
      try {
        const JSON5 = require('json5');
        const firebaseConfig = JSON5.parse(jetpack.read(firebaseJsonPath));
        hostingPort = firebaseConfig.emulators?.hosting?.port || hostingPort;
      } catch (e) {
        // Use default
      }
    }

    const forwardUrl = `http://localhost:${hostingPort}/backend-manager/payments/webhook?processor=stripe&key=${process.env.BACKEND_MANAGER_WEBHOOK_KEY}`;

    this.log(chalk.gray(`  Stripe webhook forwarding -> localhost:${hostingPort}\n`));

    const stripeProcess = spawn(stripePath, [
      'listen',
      '--forward-to', forwardUrl,
      '--api-key', process.env.STRIPE_SECRET_KEY,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    // Prefix output with [Stripe]
    const prefixStream = (stream) => {
      stream.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          console.log(chalk.gray(`  [Stripe] ${line}`));
        }
      });
    };

    prefixStream(stripeProcess.stdout);
    prefixStream(stripeProcess.stderr);

    stripeProcess.on('error', (error) => {
      this.log(chalk.yellow(`  [Stripe] Error: ${error.message}`));
    });

    stripeProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        this.log(chalk.yellow(`  [Stripe] Exited with code ${code}`));
      }
    });

    return stripeProcess;
  }
}

module.exports = BaseCommand;
