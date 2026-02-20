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
    this.log(chalk.cyan('\n  Starting Firebase emulators (keep-alive mode)...\n'));
    this.log(chalk.gray('  Emulators will stay running until you press Ctrl+C\n'));

    // Warn if TEST_EXTENDED_MODE is enabled
    if (process.env.TEST_EXTENDED_MODE) {
      this.log(chalk.yellow.bold('\n  ⚠️⚠️⚠️  WARNING: TEST_EXTENDED_MODE IS TRUE  ⚠️⚠️⚠️'));
      this.log(chalk.yellow('  External API calls (emails, SendGrid, etc.) are ENABLED!'));
      this.log(chalk.yellow('  This will send real emails and make real API calls.\n'));
    }

    // Start BEM watcher in background
    const watcher = new WatchCommand(this.main);
    watcher.startBackground();

    // Start Stripe webhook forwarding in background
    this.startStripeWebhookForwarding();

    // Run emulators with keep-alive command (use single quotes since runWithEmulators wraps in double quotes)
    const keepAliveCommand = "echo ''; echo 'Emulators ready. Press Ctrl+C to shut down...'; sleep 86400";

    try {
      await this.runWithEmulators(keepAliveCommand);
    } catch (error) {
      // User pressed Ctrl+C - this is expected
      this.log(chalk.gray('\n  Emulators stopped.\n'));
    }
  }

  /**
   * Run a command with Firebase emulators
   * @param {string} command - The command to execute inside emulators:exec
   * @returns {Promise<void>}
   */
  async runWithEmulators(command) {
    const projectDir = this.main.firebaseProjectPath;

    // Load emulator ports from firebase.json
    const emulatorPorts = this.loadEmulatorPorts(projectDir);

    // Check for port conflicts before starting emulators
    const canProceed = await this.checkAndKillBlockingProcesses(emulatorPorts);
    if (!canProceed) {
      throw new Error('Port conflicts could not be resolved');
    }

    // BEM_TESTING=true is passed so Functions skip external API calls (emails, SendGrid)
    // hosting is included so localhost:5002 rewrites work (e.g., /backend-manager -> bm_api)
    // pubsub is included so scheduled functions (bm_cronDaily) can be triggered in tests
    // Use double quotes for command wrapper since the command may contain single quotes (JSON strings)
    const emulatorsCommand = `BEM_TESTING=true firebase emulators:exec --only functions,firestore,auth,database,hosting,pubsub --ui "${command}"`;

    await powertools.execute(emulatorsCommand, {
      log: true,
      cwd: projectDir,
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

module.exports = EmulatorsCommand;
