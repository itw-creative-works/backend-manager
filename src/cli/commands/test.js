const BaseCommand = require('./base-command');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const jetpack = require('fs-jetpack');
const JSON5 = require('json5');
const powertools = require('node-powertools');
const { DEFAULT_EMULATOR_PORTS } = require('./setup-tests/emulator-config');
const EmulatorCommand = require('./emulator');

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

    // Check if emulator is already running
    const emulatorRunning = this.isEmulatorRunning(emulatorPorts);

    if (emulatorRunning) {
      this.log(chalk.cyan('Running tests against EXISTING emulator'));
      await this.runTestsDirectly(testCommand, functionsDir, emulatorPorts);
    } else {
      this.log(chalk.cyan('Starting emulator and running tests...'));
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

    // Derive convenience values
    const projectId = config.firebaseConfig?.projectId;
    const backendManagerKey = argv.key || process.env.BACKEND_MANAGER_KEY;
    const appId = config.brand?.id;
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

    // Pass entire config + convenience aliases used by runner/helpers
    return {
      ...config,
      appId,
      projectId,
      backendManagerKey,
      domain,
      brandName: config.brand?.name,
      githubRepoWebsite: config.github?.repo_website,
    };
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
   * Check if emulator is already running
   */
  isEmulatorRunning(emulatorPorts) {
    // Check if functions emulator port is in use
    // If it is, assume emulator is running
    return this.isPortInUse(emulatorPorts.functions);
  }

  /**
   * Run tests directly (emulator already running)
   */
  async runTestsDirectly(testCommand, functionsDir, emulatorPorts) {
    const projectDir = this.main.firebaseProjectPath;

    this.log(chalk.gray(`  Hosting: http://127.0.0.1:${emulatorPorts.hosting}`));
    this.log(chalk.gray(`  Firestore: 127.0.0.1:${emulatorPorts.firestore}`));
    this.log(chalk.gray(`  Auth: 127.0.0.1:${emulatorPorts.auth}`));
    this.log(chalk.gray(`  UI: http://127.0.0.1:${emulatorPorts.ui}`));

    // Set up log file in the project directory
    const logPath = path.join(projectDir, 'functions', 'test.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'w' });
    const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    this.log(chalk.gray(`  Logs saving to: ${logPath}\n`));

    try {
      await powertools.execute(testCommand, {
        log: false,
        cwd: functionsDir,
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
      process.exit(1);
    }
  }

  /**
   * Run tests with Firebase emulator (starts emulator, runs tests, shuts down)
   */
  async runEmulatorTests(testCommand) {
    this.log(chalk.gray('  Starting Firebase emulator...\n'));

    // Use EmulatorCommand to run tests with emulator
    const emulatorCmd = new EmulatorCommand(this.main);

    try {
      await emulatorCmd.runWithEmulator(testCommand);
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
