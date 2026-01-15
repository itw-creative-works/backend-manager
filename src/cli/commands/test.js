const BaseCommand = require('./base-command');
const path = require('path');
const chalk = require('chalk');
const jetpack = require('fs-jetpack');
const JSON5 = require('json5');
const powertools = require('node-powertools');
const { DEFAULT_EMULATOR_PORTS } = require('./setup-tests/emulators-config');
const EmulatorsCommand = require('./emulators');

class TestCommand extends BaseCommand {
  async execute() {
    const self = this.main;
    const argv = self.argv;

    // Get test paths from CLI args (e.g., "bem test admin/" or "bem test general/generate-uuid")
    const testPaths = (argv._ || []).slice(1); // Remove 'test' from args

    // Determine the project directory
    const projectDir = self.firebaseProjectPath;
    const functionsDir = path.join(projectDir, 'functions');

    // Load emulator ports from firebase.json
    const emulatorPorts = this.loadEmulatorPorts(projectDir);

    // Load project configuration
    const projectConfig = this.loadProjectConfig(functionsDir, argv);
    if (!projectConfig) {
      return;
    }

    // Build unified test config object
    // Use hosting URL for all API requests (rewrites to bm_api function)
    const testConfig = {
      ...projectConfig,
      hostingUrl: `http://127.0.0.1:${emulatorPorts.hosting}`,
      projectDir,
      testPaths,
      emulatorPorts,
      includeLegacy: argv.legacy || false, // Include legacy tests from test/functions/
    };

    // Build the test command
    const testCommand = this.buildTestCommand(testConfig);

    // Check if emulators are already running
    const emulatorsRunning = this.areEmulatorsRunning(emulatorPorts);

    if (emulatorsRunning) {
      this.log(chalk.cyan('Running tests against EXISTING emulators'));
      await this.runTestsDirectly(testCommand, functionsDir, emulatorPorts);
    } else {
      this.log(chalk.cyan('Starting emulators and running tests...'));
      await this.runEmulatorTests(testCommand);
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

  /**
   * Load project configuration from backend-manager-config.json and .env
   */
  loadProjectConfig(functionsDir, argv) {
    // Load .env first so env vars are available
    const envPath = path.join(functionsDir, '.env');
    if (jetpack.exists(envPath)) {
      require('dotenv').config({ path: envPath });
    }

    // Load backend-manager-config.json
    const configPath = path.join(functionsDir, 'backend-manager-config.json');
    if (!jetpack.exists(configPath)) {
      this.logError('Error: Missing backend-manager-config.json');
      return null;
    }

    let config;
    try {
      config = JSON5.parse(jetpack.read(configPath));
    } catch (error) {
      this.logError(`Error: Could not parse backend-manager-config.json: ${error.message}`);
      return null;
    }

    // Extract values from expected config structure
    const projectId = config.firebaseConfig?.projectId;
    const backendManagerKey = argv.key || process.env.BACKEND_MANAGER_KEY;
    const appId = config.brand?.id;
    const brandName = config.brand?.name;
    const githubRepoWebsite = config.github?.repo_website;

    // Extract domain from brand.contact.email (e.g., 'support@example.com' -> 'example.com')
    const contactEmail = config.brand?.contact?.email || '';
    const domain = contactEmail.includes('@') ? contactEmail.split('@')[1] : '';

    // Validate required configuration
    if (!projectId) {
      this.logError('Error: Missing firebaseConfig.projectId in backend-manager-config.json');
      return null;
    }

    if (!backendManagerKey) {
      this.logError('Error: Missing backend manager key');
      this.log(chalk.gray('  Set BACKEND_MANAGER_KEY in your .env file or pass --key flag'));
      return null;
    }

    if (!appId) {
      this.logError('Error: Missing brand.id in backend-manager-config.json');
      return null;
    }

    if (!domain) {
      this.logError('Error: Missing brand.contact.email in backend-manager-config.json');
      return null;
    }

    return { appId, projectId, backendManagerKey, domain, brandName, githubRepoWebsite };
  }

  /**
   * Build the test command with environment variables
   */
  buildTestCommand(testConfig) {
    const testScriptPath = path.join(__dirname, '..', '..', 'test', 'run-tests.js');

    // Pass entire config as base64-encoded JSON to avoid shell escaping issues
    const testEnv = {
      BEM_TEST_CONFIG: Buffer.from(JSON.stringify(testConfig)).toString('base64'),
      FIRESTORE_EMULATOR_HOST: `127.0.0.1:${testConfig.emulatorPorts.firestore}`,
      FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${testConfig.emulatorPorts.auth}`,
    };

    const envString = Object.entries(testEnv)
      .map(([key, value]) => `${key}='${value}'`)
      .join(' ');

    return `${envString} node "${testScriptPath}"`;
  }

  /**
   * Check if emulators are already running
   */
  areEmulatorsRunning(emulatorPorts) {
    // Check if functions emulator port is in use
    // If it is, assume all emulators are running
    return this.isPortInUse(emulatorPorts.functions);
  }

  /**
   * Run tests directly (emulators already running)
   */
  async runTestsDirectly(testCommand, functionsDir, emulatorPorts) {
    this.log(chalk.gray(`  Hosting: http://127.0.0.1:${emulatorPorts.hosting}`));
    this.log(chalk.gray(`  Firestore: 127.0.0.1:${emulatorPorts.firestore}`));
    this.log(chalk.gray(`  Auth: 127.0.0.1:${emulatorPorts.auth}`));
    this.log(chalk.gray(`  UI: http://127.0.0.1:${emulatorPorts.ui}\n`));

    try {
      await powertools.execute(testCommand, {
        log: true,
        cwd: functionsDir,
      });
    } catch (error) {
      process.exit(1);
    }
  }

  /**
   * Run tests with Firebase emulators (starts emulators, runs tests, shuts down)
   */
  async runEmulatorTests(testCommand) {
    this.log(chalk.gray('  Starting Firebase emulators...\n'));

    // Use EmulatorsCommand to run tests with emulators
    const emulatorsCmd = new EmulatorsCommand(this.main);

    try {
      await emulatorsCmd.runWithEmulators(testCommand);
    } catch (error) {
      // Only exit with error if it wasn't a user-initiated exit
      if (error.code !== 0) {
        this.logError(`Emulator error: ${error.message || error}`);
      }
      process.exit(1);
    }
  }
}

module.exports = TestCommand;
