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

    const blockedPorts = [];
    for (const { name, port } of portsToCheck) {
      const processInfo = this.getProcessOnPort(port);
      if (processInfo) {
        blockedPorts.push({ name, port, ...processInfo });
      }
    }

    if (blockedPorts.length === 0) {
      return true;
    }

    this.log(chalk.yellow('\n  The following ports are in use:'));
    for (const { name, port, pid, processName, command } of blockedPorts) {
      const cmdInfo = command ? ` ${command}` : '';
      this.log(chalk.gray(`    - ${name} emulator (port ${port}) - PID ${pid} (${processName})${cmdInfo}`));
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

    for (const { name, port, pid } of blockedPorts) {
      try {
        process.kill(pid, 'SIGTERM');
        this.log(chalk.green(`    ✓ Killed process ${pid} on port ${port} (${name})`));
      } catch (error) {
        this.logError(`    ✗ Failed to kill process ${pid}: ${error.message}`);
        return false;
      }
    }

    // Wait a moment for ports to be released
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  }

  /**
   * Get info about a process using a specific port
   * @param {number} port - Port number to check
   * @returns {object|null} - Process info if port is in use, null otherwise
   */
  getProcessOnPort(port) {
    try {
      const result = execSync(`lsof -ti:${port} 2>/dev/null`, { encoding: 'utf8' });
      const pid = parseInt(result.trim().split('\n')[0], 10);
      if (isNaN(pid)) {
        return null;
      }

      // Get more info about the process
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
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if a port is in use
   * @param {number} port - Port number to check
   * @returns {boolean} - true if port is in use
   */
  isPortInUse(port) {
    return this.getProcessOnPort(port) !== null;
  }
}

module.exports = BaseCommand;