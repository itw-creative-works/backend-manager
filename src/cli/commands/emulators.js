const BaseCommand = require('./base-command');
const path = require('path');
const chalk = require('chalk');
const jetpack = require('fs-jetpack');
const JSON5 = require('json5');
const powertools = require('node-powertools');
const WatchCommand = require('./watch');
const { DEFAULT_EMULATOR_PORTS } = require('./setup-tests/emulators-config');

class EmulatorsCommand extends BaseCommand {
  async execute() {
    const projectDir = this.main.firebaseProjectPath;

    // Load emulator ports from firebase.json
    const emulatorPorts = this.loadEmulatorPorts(projectDir);

    // Check for port conflicts before starting emulators
    const canProceed = await this.checkAndKillBlockingProcesses(emulatorPorts);
    if (!canProceed) {
      return;
    }

    this.log(chalk.cyan('\n  Starting Firebase emulators (keep-alive mode)...\n'));
    this.log(chalk.gray('  Emulators will stay running until you press Ctrl+C\n'));

    // Start BEM watcher in background
    const watcher = new WatchCommand(this.main);
    watcher.startBackground();

    // Start emulators with a long-running command to keep them alive
    // BEM_TESTING=true is passed so Functions skip external API calls (emails, SendGrid)
    const emulatorsCommand = `BEM_TESTING=true firebase emulators:exec --only functions,firestore,auth,database --ui 'echo ""; echo "Emulators ready. Press Ctrl+C to shut down..."; sleep 86400'`;

    try {
      await powertools.execute(emulatorsCommand, {
        log: true,
        cwd: projectDir,
      });
    } catch (error) {
      // User pressed Ctrl+C - this is expected
      this.log(chalk.gray('\n  Emulators stopped.\n'));
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

module.exports = EmulatorsCommand;
