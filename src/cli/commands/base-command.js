const chalk = require('chalk');
const inquirer = require('inquirer');
const { execSync, spawn } = require('child_process');
const path = require('path');
const jetpack = require('fs-jetpack');

class BaseCommand {
  constructor(main) {
    this.main = main;
    this.firebaseProjectPath = main.firebaseProjectPath;
    this.argv = main.argv;
    this.options = main.options;
  }

  async execute() {
    throw new Error('Execute method must be implemented');
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

    const { shouldKill } = await inquirer.prompt([{
      type: 'confirm',
      name: 'shouldKill',
      message: 'Kill these processes to free the ports?',
      default: true,
    }]);

    if (!shouldKill) {
      this.log(chalk.gray('\n  Aborting. Free the ports and try again.\n'));
      return false;
    }

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

    // Load .env so STRIPE_SECRET_KEY and BACKEND_MANAGER_KEY are available
    const envPath = path.join(functionsDir, '.env');
    if (jetpack.exists(envPath)) {
      require('dotenv').config({ path: envPath });
    }

    // Check for Stripe secret key
    if (!process.env.STRIPE_SECRET_KEY) {
      this.log(chalk.gray('  (Stripe webhook forwarding disabled - STRIPE_SECRET_KEY not set in .env)\n'));
      return null;
    }

    // Check for Backend Manager key
    if (!process.env.BACKEND_MANAGER_KEY) {
      this.log(chalk.gray('  (Stripe webhook forwarding disabled - BACKEND_MANAGER_KEY not set in .env)\n'));
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

    const forwardUrl = `http://localhost:${hostingPort}/backend-manager/payments/webhook?processor=stripe&key=${process.env.BACKEND_MANAGER_KEY}`;

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