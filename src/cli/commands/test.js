const BaseCommand = require('./base-command');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const chalk = require('chalk').default;
const jetpack = require('fs-jetpack');
const JSON5 = require('json5');
const powertools = require('node-powertools');
const { DEFAULT_EMULATOR_PORTS } = require('./setup-tests/emulator-config');
const { writeTestMode, captureSyncedEnv, SYNCED_ENV_KEYS } = require('../../test/utils/test-mode-file');
const EmulatorCommand = require('./emulator');

class TestCommand extends BaseCommand {
  async execute() {
    const self = this.main;
    const argv = self.argv;

    // `--extended` CLI shorthand for the shared, unprefixed TEST_EXTENDED_MODE
    // env var (cross-framework parity with BXM/UJM/EM). Either the flag OR the
    // env var opts into REAL external services (default skipped). Set this
    // BEFORE the captureSyncedEnv/writeTestMode pre-flight below so the flag
    // flows into the emulator's test-mode.json too — making
    // `npx mgr test --extended` equivalent to `TEST_EXTENDED_MODE=true npx mgr test`.
    if (argv.extended) {
      process.env.TEST_EXTENDED_MODE = 'true';
    }

    // Framework self-test: when `npx mgr test` is run from the backend-manager repo
    // (no firebase.json in cwd), boot the bundled fixture project under
    // src/test/fixtures/firebase-project. Mirrors BXM/UJM *_TEST_BOOT_PROJECT.
    const isSelfTest = this.setupSelfTest();

    // Get test paths from CLI args (e.g., "bem test admin/" or "bem test general/generate-uuid")
    const testPaths = (argv._ || []).slice(1); // Remove 'test' from args

    // On self-test with no explicit target, run only the boot smoke suite — the
    // full routes/events/rules suites need a real consumer backend, not the
    // minimal fixture.
    if (isSelfTest && testPaths.length === 0) {
      testPaths.push('bem:boot');
    }

    // Determine the project directory
    const projectDir = self.firebaseProjectPath;
    const functionsDir = path.join(projectDir, 'functions');

    // Pre-flight: write the allowlisted env subset to a shared state file
    // (`<projectDir>/.temp/test-mode.json`). The running emulator watches this
    // file and mutates its own `process.env` to match, eliminating the need
    // to coordinate env vars across both terminals. The test command is the
    // authoritative writer — whatever you pass here becomes the live mode
    // within ~50ms.
    //
    // Allowlist lives in src/test/utils/test-mode-file.js (SYNCED_ENV_KEYS).
    // Today: just TEST_EXTENDED_MODE. Add more keys there to make them
    // live-syncable.
    {
      const envSubset = captureSyncedEnv(process.env);
      writeTestMode(projectDir, envSubset);
      const extended = !!process.env.TEST_EXTENDED_MODE;
      this.log(chalk.gray(`  Test mode: ${extended ? 'extended (real external APIs)' : 'normal (external APIs skipped)'}`));
    }

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
      apiUrl: `http://127.0.0.1:${emulatorPorts.hosting}`,
      projectDir,
      testPaths,
      emulatorPorts,
      includeLegacy: argv.legacy || false, // Include legacy tests from test/functions/
      isFrameworkSelfTest: isSelfTest, // gates the boot/ smoke layer (excluded for consumers)
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
      await this.runEmulatorTests(testCommand, functionsDir);
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
      require('dotenv').config({ path: envPath, quiet: true });
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

    // Derive computed values (not in config file)
    const backendManagerKey = argv.key || process.env.BACKEND_MANAGER_KEY;
    const backendManagerWebhookKey = argv.webhookKey || process.env.BACKEND_MANAGER_WEBHOOK_KEY;
    const contactEmail = config.brand?.contact?.email || '';
    const domain = contactEmail.includes('@') ? contactEmail.split('@')[1] : '';

    // Validate required configuration
    if (!config.firebaseConfig?.projectId) {
      this.logError('Error: Missing firebaseConfig.projectId in backend-manager-config.json');
      return null;
    }

    if (!backendManagerKey) {
      this.logError('Error: Missing backend manager key');
      this.log(chalk.gray('  Set BACKEND_MANAGER_KEY in your .env file or pass --key flag'));
      return null;
    }

    if (!backendManagerWebhookKey) {
      this.logError('Error: Missing backend manager webhook key');
      this.log(chalk.gray('  Set BACKEND_MANAGER_WEBHOOK_KEY in your .env file or pass --webhook-key flag'));
      return null;
    }

    if (!config.brand?.id) {
      this.logError('Error: Missing brand.id in backend-manager-config.json');
      return null;
    }

    if (!domain) {
      this.logError('Error: Missing brand.contact.email in backend-manager-config.json');
      return null;
    }

    // Pass entire config + computed values not in config file
    return {
      ...config,
      backendManagerKey,
      backendManagerWebhookKey,
      domain,
    };
  }

  /**
   * Build the test command with environment variables
   */
  /**
   * Framework self-test detection + fixture wiring.
   *
   * When `npx mgr test` runs from a directory that is NOT a Firebase project
   * (no firebase.json) AND is the backend-manager repo (or BEM_TEST_BOOT_PROJECT
   * is set), point the run at the bundled fixture project and link the local
   * framework + firebase deps into it so the emulator's function workers resolve
   * them. This is BEM's equivalent of BXM's BXM_TEST_BOOT_PROJECT / UJM's
   * UJ_TEST_BOOT_PROJECT. Returns true if self-test wiring was applied.
   */
  setupSelfTest() {
    const self = this.main;

    // Normal consumer run — cwd is already a Firebase project. Nothing to do.
    if (jetpack.exists(path.join(self.firebaseProjectPath, 'firebase.json'))) {
      return false;
    }

    // Self-test if BEM_TEST_BOOT_PROJECT is set, or cwd is the backend-manager repo.
    let isSelfTest = !!process.env.BEM_TEST_BOOT_PROJECT;
    if (!isSelfTest) {
      try {
        isSelfTest = require(path.join(process.cwd(), 'package.json')).name === 'backend-manager';
      } catch (_) { /* no package.json — not a self-test */ }
    }
    if (!isSelfTest) {
      return false;
    }

    const fixture = process.env.BEM_TEST_BOOT_PROJECT
      ? path.resolve(process.env.BEM_TEST_BOOT_PROJECT)
      : path.resolve(__dirname, '..', '..', 'test', 'fixtures', 'firebase-project');

    process.env.BEM_TEST_BOOT_PROJECT = fixture;
    self.firebaseProjectPath = fixture;

    // The test HTTP client authenticates with the fixture's admin keys (the
    // server reads the same keys from backend-manager-config.json). Inject them
    // from the fixture config so loadProjectConfig finds them — no committed
    // .env needed (single source = the fixture config).
    try {
      const cfg = require(path.join(fixture, 'functions', 'backend-manager-config.json'));
      process.env.BACKEND_MANAGER_KEY = process.env.BACKEND_MANAGER_KEY || cfg.backend_manager?.key;
      process.env.BACKEND_MANAGER_WEBHOOK_KEY = process.env.BACKEND_MANAGER_WEBHOOK_KEY || cfg.backend_manager?.webhookKey;
    } catch (_) { /* fixture config unreadable — let the normal key check report it */ }

    this.ensureFixtureServiceAccount(fixture);
    this.linkFixtureDeps(fixture);
    this.log(chalk.cyan(`  Self-test: booting bundled fixture project (${fixture})`));
    return true;
  }

  /**
   * Write a throwaway service-account.json into the fixture so firebase-admin's
   * `cert()` can parse it. BEM's manager uses the cert path when
   * GOOGLE_APPLICATION_CREDENTIALS is unset (as in the functions emulator). The
   * key is a freshly-generated RSA key — emulator-only, never authenticates
   * against Google (the project is a `demo-` project), so it is generated at
   * runtime and gitignored, never committed.
   */
  ensureFixtureServiceAccount(fixture) {
    const crypto = require('crypto');
    const saPath = path.join(fixture, 'functions', 'service-account.json');
    const projectId = 'demo-backend-manager';
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const serviceAccount = {
      type: 'service_account',
      project_id: projectId,
      private_key_id: '0'.repeat(40),
      private_key: privateKey,
      client_email: `fixture@${projectId}.iam.gserviceaccount.com`,
      client_id: '0'.repeat(21),
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/fixture%40${projectId}.iam.gserviceaccount.com`,
    };
    try {
      fs.writeFileSync(saPath, JSON.stringify(serviceAccount, null, 2) + '\n');
    } catch (e) {
      this.logWarning(`Could not write fixture service-account.json: ${e.message}`);
    }
  }

  /**
   * Symlink the local framework + firebase deps into the fixture's
   * functions/node_modules so the emulator's function workers can resolve them.
   * Mirrors what `npx mgr install dev` does in a real consumer, but for the
   * fixture and without an npm install (firebase-admin/firebase-functions come
   * from BEM's own node_modules; backend-manager points at the repo root).
   */
  linkFixtureDeps(fixture) {
    const fnNodeModules = path.join(fixture, 'functions', 'node_modules');
    jetpack.dir(fnNodeModules);

    const bemRoot = path.resolve(__dirname, '..', '..', '..'); // src/cli/commands -> repo root
    const links = {
      'backend-manager': bemRoot,
      'firebase-admin': path.join(bemRoot, 'node_modules', 'firebase-admin'),
      'firebase-functions': path.join(bemRoot, 'node_modules', 'firebase-functions'),
    };

    for (const [name, target] of Object.entries(links)) {
      const linkPath = path.join(fnNodeModules, name);
      try { fs.rmSync(linkPath, { recursive: true, force: true }); } catch (_) { /* nothing to remove */ }
      try {
        fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
      } catch (e) {
        this.logWarning(`Could not link ${name} into fixture: ${e.message}`);
      }
    }
  }

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
   * Signal the running emulator process to roll emulator.log.
   *
   * Mechanism: write a sentinel file at emulator.log.reset. The emulator command
   * (src/cli/commands/emulator.js) polls for it and, on detection, closes its
   * current write stream and reopens with flags: 'w' (truncating cleanly from its
   * own perspective — avoids the sparse-file problem caused by external truncation).
   *
   * Waits up to 2s for the sentinel to be consumed. If it's still there after 2s
   * the emulator isn't watching (probably running an older BEM or started outside
   * `npx mgr emulator`); we delete the sentinel and proceed — tests still run, the
   * log just won't be reset for this run.
   */
  async requestEmulatorLogReset(projectDir) {
    const sentinelPath = this.getTempPath('emulator.log.reset');

    try {
      fs.writeFileSync(sentinelPath, '');
    } catch (e) {
      return; // Can't write — skip, not fatal
    }

    // Poll for the emulator to consume the sentinel (it deletes the file when done)
    const maxWaitMs = 2000;
    const pollIntervalMs = 100;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      if (!fs.existsSync(sentinelPath)) {
        return; // Emulator picked it up and rolled the log
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // Timed out — emulator didn't see the sentinel. Clean up so we don't leave it behind.
    try { fs.unlinkSync(sentinelPath); } catch (e) { /* ok */ }
  }

  /**
   * Run tests directly (emulator already running)
   */
  async runTestsDirectly(testCommand, functionsDir, emulatorPorts) {
    const projectDir = this.main.firebaseProjectPath;

    // Ask the running emulator process to roll emulator.log so this test run gets a
    // clean slate. We touch a sentinel file the emulator polls for (every ~500ms) and
    // wait briefly for it to be consumed. If the emulator isn't watching (older BEM
    // version, or not started via `npx mgr emulator`), we time out silently — the log
    // just won't be fresh, tests still run normally.
    await this.requestEmulatorLogReset(projectDir);

    this.log(chalk.gray(`  Hosting: http://127.0.0.1:${emulatorPorts.hosting}`));
    this.log(chalk.gray(`  Firestore: 127.0.0.1:${emulatorPorts.firestore}`));
    this.log(chalk.gray(`  Auth: 127.0.0.1:${emulatorPorts.auth}`));
    this.log(chalk.gray(`  UI: http://127.0.0.1:${emulatorPorts.ui}`));

    // Set up log file in the project's functions/ directory (alongside firebase-tools logs)
    const logPath = this.getLogsPath('test.log');
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
   * Run tests with Firebase emulator (starts emulator, runs tests, shuts down).
   *
   * Two real child processes are used so emulator output and test-runner output
   * land in separate log files:
   *   - `emulator.log` — `firebase emulators:start` stdout/stderr (managed by EmulatorCommand)
   *   - `test.log`     — the test-runner subprocess stdout/stderr (managed here)
   */
  async runEmulatorTests(testCommand, functionsDir) {
    this.log(chalk.gray('  Starting Firebase emulator...\n'));

    const emulatorCmd = new EmulatorCommand(this.main);
    let started;

    try {
      started = await emulatorCmd.startEmulators();
    } catch (error) {
      this.logError(`Emulator error: ${error.message || error}`);
      process.exit(1);
    }

    const { shutdown, exitPromise, emulatorPorts } = started;

    // Forward Ctrl+C to a clean emulator shutdown
    const onSigint = async () => {
      this.log(chalk.gray('\n  Shutting down emulator...'));
      await shutdown();
      process.exit(130);
    };
    process.once('SIGINT', onSigint);

    // Print the same connection summary the existing-emulator path shows
    this.log('');
    this.log(chalk.gray(`  Hosting: http://127.0.0.1:${emulatorPorts.hosting}`));
    this.log(chalk.gray(`  Firestore: 127.0.0.1:${emulatorPorts.firestore}`));
    this.log(chalk.gray(`  Auth: 127.0.0.1:${emulatorPorts.auth}`));
    this.log(chalk.gray(`  UI: http://127.0.0.1:${emulatorPorts.ui}`));

    // Spawn the test runner as its own child so its stdout/stderr can be teed to test.log
    const logPath = this.getLogsPath('test.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'w' });
    const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    this.log(chalk.gray(`  Logs saving to: ${logPath}\n`));

    let testExitCode = 0;

    try {
      const testChild = spawn('sh', ['-c', testCommand], {
        cwd: functionsDir,
        env: { ...process.env, FORCE_COLOR: '1' },
        stdio: ['inherit', 'pipe', 'pipe'],
      });

      testChild.stdout.on('data', (data) => {
        process.stdout.write(data);
        if (!logStream.destroyed) logStream.write(stripAnsi(data.toString()));
      });

      testChild.stderr.on('data', (data) => {
        process.stderr.write(data);
        if (!logStream.destroyed) logStream.write(stripAnsi(data.toString()));
      });

      testExitCode = await new Promise((resolve) => {
        testChild.on('close', (code) => {
          if (!logStream.destroyed) logStream.end();
          resolve(code ?? 1);
        });
      });
    } catch (error) {
      this.logError(`Test runner error: ${error.message || error}`);
      testExitCode = 1;
    } finally {
      process.removeListener('SIGINT', onSigint);
      await shutdown();
      await exitPromise;
    }

    process.exit(testExitCode);
  }
}

module.exports = TestCommand;
