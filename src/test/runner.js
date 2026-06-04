const os = require('os');
const path = require('path');
const Module = require('module');
const jetpack = require('fs-jetpack');
const chalk = require('chalk').default;

const HttpClient = require('./utils/http-client.js');
const assertions = require('./utils/assertions.js');
const testAccounts = require('./test-accounts.js');
const rulesClient = require('./utils/firestore-rules-client.js');
const { EXTENDED_MODE_WARNING } = require('./utils/extended-mode-warning.js');

/**
 * Error class for runtime test skipping
 */
class SkipError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SkipError';
  }
}

/**
 * BEM Integration Test Runner
 * Supports standalone tests and test suites with sequential tests and shared state
 */
class TestRunner {
  constructor(options) {
    options = options || {};

    // Store config directly, only add defaults for truly optional fields
    this.config = {
      ...options,
      bemDir: options.bemDir || path.resolve(__dirname, '..'),
      timeout: options.timeout || 30000,
    };

    // Alias for backwards compatibility
    this.options = this.config;

    this.rulesContext = null;

    this.accounts = null;
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      tests: [],
      startTime: null,
      endTime: null,
    };
  }

  /**
   * Main run method
   */
  async run() {
    // Abort if BEM is running from the user's home directory (e.g., accidental ~/node_modules install)
    const homeDir = os.homedir();
    if (__dirname.startsWith(path.join(homeDir, 'node_modules'))) {
      console.error(chalk.red('\n  ERROR: BEM is running from ~/node_modules (home directory install).'));
      console.error(chalk.red('  This is likely an accidental global install that shadows local project copies.'));
      console.error(chalk.red(`  Fix: rm -rf ${path.join(homeDir, 'node_modules')} ${path.join(homeDir, 'package.json')} ${path.join(homeDir, 'package-lock.json')}`));
      console.error(chalk.red(`  Running from: ${__dirname}\n`));
      process.exit(1);
    }

    // Set testing flag to skip external API calls (emails, SendGrid)
    process.env.BEM_TESTING = 'true';

    this.results.startTime = Date.now();

    console.log(chalk.bold('\n  BEM Integration Tests\n'));

    // Warn if TEST_EXTENDED_MODE is enabled
    if (process.env.TEST_EXTENDED_MODE) {
      console.log(chalk.yellow.bold(`  ${EXTENDED_MODE_WARNING[0]}`));
      EXTENDED_MODE_WARNING.slice(1).forEach((line) => console.log(chalk.yellow(`  ${line}`)));
      console.log('');
    }

    // Validate configuration
    if (!this.validateConfig()) {
      return this.results;
    }

    // Health check (use basic http client without accounts)
    // Use hosting URL for all requests (rewrites to bm_api function)
    const healthHttp = new HttpClient({
      apiUrl: this.options.apiUrl,
      timeout: this.options.timeout,
    });

    const healthy = await this.healthCheck(healthHttp);
    if (!healthy) {
      return this.results;
    }

    // Setup accounts
    const accountsReady = await this.setupAccounts();
    if (!accountsReady) {
      return this.results;
    }

    // Discover and run tests
    // BEM tests are in the top-level test/ directory of the package
    const bemTestsDir = path.resolve(__dirname, '../../test');
    const projectTestsDir = path.join(this.options.projectDir, 'test');

    // Run BEM default tests
    if (jetpack.exists(bemTestsDir)) {
      console.log(chalk.bold('  BEM Core Tests'));
      await this.runTestsInDir(bemTestsDir, 'bem');
    }

    // Run project-specific tests
    if (jetpack.exists(projectTestsDir)) {
      console.log(chalk.bold('\n  Project Tests'));
      await this.runTestsInDir(projectTestsDir, 'project');
    }

    // Cleanup rules context
    if (this.rulesContext) {
      await this.rulesContext.cleanup();
    }

    // Report results
    this.reportResults();

    this.results.endTime = Date.now();
    return this.results;
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.options.apiUrl) {
      console.log(chalk.red('  ✗ Missing apiUrl'));
      console.log(chalk.gray('    Set BEM_API_URL environment variable or pass --url flag'));
      return false;
    }

    if (!this.options.backendManagerKey) {
      console.log(chalk.red('  ✗ Missing backendManagerKey'));
      console.log(chalk.gray('    Set BEM_BACKEND_MANAGER_KEY environment variable or pass --key flag'));
      return false;
    }

    if (!this.options.backendManagerWebhookKey) {
      console.log(chalk.red('  ✗ Missing backendManagerWebhookKey'));
      console.log(chalk.gray('    Set BEM_BACKEND_MANAGER_WEBHOOK_KEY environment variable or pass --webhook-key flag'));
      return false;
    }

    if (!this.options.brand?.id) {
      console.log(chalk.red('  ✗ Missing brand.id'));
      console.log(chalk.gray('    Could not determine brand ID from configuration'));
      return false;
    }

    if (!this.options.domain) {
      console.log(chalk.red('  ✗ Missing domain'));
      console.log(chalk.gray('    Could not determine domain from brand.contact.email'));
      return false;
    }

    return true;
  }

  /**
   * Check if server is healthy
   */
  async healthCheck(http) {
    process.stdout.write(chalk.gray('  Checking server health... '));

    try {
      const response = await http.get('test/health');

      if (response.success) {
        console.log(chalk.green('✓'));

        // Abort if the running emulator belongs to a different project.
        // This catches the case where you run `npx mgr test` in project A
        // while project B's emulator is still up on the same ports — requests
        // hit the wrong hosting rewrites and tests fail with mysterious 404s.
        const mismatch = await this.checkProjectMismatch(response.data);
        if (mismatch) {
          return false;
        }

        // Report the live mode the emulator just confirmed. The test command
        // writes `.temp/test-mode.json` before invoking us; the emulator's
        // file-watcher mutates its `process.env.TEST_EXTENDED_MODE` to match;
        // the health endpoint re-reads the file as a freshness guard. By
        // construction these are equal — no mismatch warning needed.
        const emulatorExtended = !!response.data?.testExtendedMode;
        console.log(chalk.gray(`  Mode: ${emulatorExtended ? 'extended (real external APIs)' : 'normal (external APIs skipped)'}`));

        return true;
      }

      console.log(chalk.red('✗'));
      console.log(chalk.red(`  Server not responding: ${response.error}`));
      console.log(chalk.gray(`  Make sure your functions are deployed and running at ${this.options.apiUrl}`));
      return false;
    } catch (error) {
      console.log(chalk.red('✗'));
      console.log(chalk.red(`  Health check failed: ${error.message}`));
      return false;
    }
  }

  /**
   * Verify the running emulator belongs to this project. Tries the Firebase
   * Emulator Hub (localhost:4400) first — it always knows the project ID
   * regardless of BEM version. Falls back to the health endpoint's projectId
   * field (added in BEM 5.3.3+). Returns true (= mismatch, abort) if the
   * project IDs differ.
   */
  async checkProjectMismatch(healthData) {
    const expectedProjectId = this.options.firebaseConfig?.projectId;
    if (!expectedProjectId) {
      return false;
    }

    let emulatorProjectId;

    // Try the Firebase Emulator Hub first (version-independent, always correct)
    try {
      const http = require('http');
      const body = await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:4400/emulators', (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      emulatorProjectId = JSON.parse(body).projectId;
    } catch (e) {
      // Hub unreachable — fall back to health endpoint
    }

    // Fall back to the health endpoint's projectId (BEM 5.3.3+)
    if (!emulatorProjectId) {
      emulatorProjectId = healthData?.projectId;
    }

    if (emulatorProjectId && emulatorProjectId !== expectedProjectId) {
      console.log(chalk.red(`\n  ✗ Project mismatch: the running emulator belongs to "${emulatorProjectId}" but this project is "${expectedProjectId}".`));
      console.log(chalk.red(`    Stop the other emulator first, then run: npx mgr emulator`));
      return true;
    }

    return false;
  }

  /**
   * Setup test accounts - deletes existing test users and recreates them fresh
   */
  async setupAccounts() {
    // Load the optional test/_init.js hooks from BOTH test roots (BEM core +
    // consumer project): extra `accounts` to create and `setup()` to seed fixtures.
    const initHooks = this.loadInitHooks();

    // Flush the entire emulator Firestore + delete Auth test users (clean slate).
    process.stdout.write(chalk.gray('  Wiping emulator + deleting test users... '));
    const deleteResult = await testAccounts.deleteTestUsers(this.options.admin, initHooks.accounts);
    console.log(chalk.green(`✓ (${deleteResult.deleted} deleted, ${deleteResult.skipped} skipped)`));

    // Ensure meta/stats doc exists (required for on-create batch writes + the
    // admin stats route). MUST run AFTER the wipe above — the flush recursively
    // deletes every collection (including meta/stats), so seeding before it would
    // be clobbered. Seeding here guarantees a `users` field survives even after
    // the notification on-write trigger merges in its `notifications` counter.
    process.stdout.write(chalk.gray('  Ensuring meta/stats doc exists... '));
    await this.ensureMetaStats();
    console.log(chalk.green('✓'));

    process.stdout.write(chalk.gray('  Creating test accounts... '));

    // Create fresh test accounts (built-in + any project-defined via _init.js).
    const result = await testAccounts.createTestAccounts(
      this.options.admin,
      this.options.domain,
      this.config,
      initHooks.accounts
    );

    if (!result.success) {
      console.log(chalk.red(`\n  ✗ Failed to setup accounts: ${result.errors?.map(e => e.error).join(', ')}`));
      return false;
    }

    console.log(chalk.green(`✓ (${result.created} created)`));

    // Fetch account privateKeys (built-in + project-defined).
    this.accounts = await testAccounts.fetchPrivateKeys(this.options.admin, this.options.domain, this.config, initHooks.accounts);

    // Run custom setup hooks (BEM core first, then consumer). Runs AFTER the
    // standard test accounts exist and AFTER the clean slate, so they can seed
    // fixtures (brands, etc.) and reference the created accounts.
    for (const setup of initHooks.setups) {
      process.stdout.write(chalk.gray('  Running test/_init.js setup... '));
      try {
        await setup({
          admin: this.options.admin,
          config: this.config,
          accounts: this.accounts,
          Manager: this.config.Manager,
          assistant: this.config.assistant,
        });
        console.log(chalk.green('✓'));
      } catch (e) {
        console.log(chalk.red(`✗ (${e.message})`));
        return false;
      }
    }

    // Initialize rules testing context for security rules tests
    process.stdout.write(chalk.gray('  Initializing rules testing context... '));
    try {
      this.rulesContext = await rulesClient.createRulesContext({
        projectId: this.options.firebaseConfig?.projectId,
        rulesPath: this.options.rulesPath,
        accounts: this.accounts,
      });
      console.log(chalk.green('✓'));
    } catch (error) {
      console.log(chalk.red(`✗ (${error.message})`));
      return false;
    }

    return true;
  }

  /**
   * Ensure meta/stats document has a baseline `users` counter (required for user
   * count increments and the admin stats route).
   *
   * Uses a MERGE write that always runs — it does NOT early-return when the doc
   * already exists. The reason: the preceding emulator wipe recursively deletes
   * the `notifications` collection, which fires the notification on-write *delete*
   * trigger for each doc. Those triggers merge `{ notifications: increment(-1) }`
   * into meta/stats and can race ahead of this seed, re-creating the doc as
   * `{ notifications: { total: -N } }` with NO `users` field. A plain
   * "create-if-missing" seed would then skip (doc.exists === true) and leave
   * `users` absent — exactly the bug that made the admin stats tests flaky.
   *
   * Merging `{ users: { total: 0 } }` is safe to run unconditionally: it seeds the
   * baseline without clobbering whatever `notifications` value those triggers land,
   * and the real user-count increments overwrite total: 0 as accounts are created.
   */
  async ensureMetaStats() {
    const admin = this.options.admin;
    const statsRef = admin.firestore().doc('meta/stats');

    await statsRef.set({
      users: { total: 0 },
      brand: this.options.brand?.id,
    }, { merge: true });
  }

  /**
   * Run all tests in a directory
   */
  async runTestsInDir(dir, source) {
    const testFiles = this.discoverTests(dir);
    const filteredTests = this.filterTests(testFiles, source);

    for (const testFile of filteredTests) {
      await this.runTestFile(testFile, source);
    }
  }

  /**
   * Load a single `test/_init.js` lifecycle hook from a test root.
   *
   * The module MUST export a function — `module.exports = (ctx) => ({ ... })` —
   * called with `{ config, Manager }` and returning the hook object
   * (`{ accounts, setup }`). This lets a project compute its accounts/fixtures
   * from config at load time.
   *
   * Returns `{}` if the file doesn't exist, isn't a function, or fails to resolve.
   */
  loadInit(testDir, label) {
    const initPath = path.join(testDir, '_init.js');

    if (!jetpack.exists(initPath)) {
      return {};
    }

    try {
      const fn = require(initPath);

      if (typeof fn !== 'function') {
        console.log(chalk.red(`  ✗ ${label} test/_init.js must export a function: module.exports = (ctx) => ({ ... })`));
        return {};
      }

      const mod = fn({ config: this.config, Manager: this.config?.Manager });
      return mod && typeof mod === 'object' ? mod : {};
    } catch (e) {
      console.log(chalk.red(`  ✗ Failed to load ${label} test/_init.js: ${e.message}`));
      return {};
    }
  }

  /**
   * Load and merge the `test/_init.js` lifecycle hooks from BOTH test roots —
   * BEM core (`<bem>/test/_init.js`) and the consumer project
   * (`<projectDir>/test/_init.js`). Same contract for both, so framework and
   * consumer authors write the identical file shape. Each exports a function
   * (see loadInit) returning:
   *   - `accounts` — extra test accounts to create alongside the built-in ones,
   *     each `{ id, uid, email, properties }` (email may use the `{domain}`
   *     placeholder). One per lifecycle this project needs to exercise.
   *   - `async setup({ admin, config, accounts, Manager, assistant })` — seed
   *     fixtures (brands, etc.) AFTER the clean slate + account creation.
   *
   * There is no `cleanup` hook: the entire emulator Firestore is flushed before
   * every run (deleteTestUsers → flushEmulatorFirestore) and each test cleans up
   * after itself, so there is nothing project-level to tear down.
   *
   * Returns the merged extra `accounts` map (BEM core then consumer; consumer
   * wins on key collision) and the ordered `setups` runners (BEM core first).
   */
  loadInitHooks() {
    const bemTestsDir = path.resolve(__dirname, '../../test');
    const projectTestsDir = path.join(this.options.projectDir, 'test');

    const hooks = [
      this.loadInit(bemTestsDir, 'BEM core'),
      this.loadInit(projectTestsDir, 'project'),
    ];

    // Merge extra accounts from both roots. Accept either an array of account
    // defs or a keyed object; normalize to a keyed object on `id`.
    const accounts = {};
    for (const h of hooks) {
      const list = Array.isArray(h.accounts)
        ? h.accounts
        : Object.values(h.accounts || {});
      for (const account of list) {
        if (account && account.id) {
          accounts[account.id] = account;
        }
      }
    }

    return {
      accounts,
      setups: hooks.filter((h) => typeof h.setup === 'function').map((h) => h.setup),
    };
  }

  /**
   * Discover test files in directory
   */
  discoverTests(dir) {
    const tests = [];
    const items = jetpack.list(dir) || [];

    for (const item of items) {
      // Skip _legacy directory
      if (item === '_legacy') {
        continue;
      }

      // Skip the _init.js lifecycle hook — it's run by setupAccounts(), not as a test.
      if (item === '_init.js') {
        continue;
      }

      // Skip legacy 'functions' directory unless --legacy flag is set
      if (item === 'functions' && !this.options.includeLegacy) {
        continue;
      }

      const fullPath = path.join(dir, item);
      const stat = jetpack.inspect(fullPath);

      if (stat.type === 'dir') {
        tests.push(...this.discoverTests(fullPath));
      } else if (stat.type === 'file' && item.endsWith('.js')) {
        tests.push(fullPath);
      }
    }

    return tests;
  }

  /**
   * Filter tests based on CLI paths
   * Supports source prefixes: bem:path/, project:path/
   */
  filterTests(testFiles, source) {
    if (this.options.testPaths.length === 0) {
      return testFiles;
    }

    return testFiles.filter(testFile => {
      const relativePath = this.getRelativeTestPath(testFile, source);

      for (const filterPath of this.options.testPaths) {
        // Check for source prefix (bem: or project:)
        const prefixMatch = filterPath.match(/^(bem|project):(.*)$/);

        if (prefixMatch) {
          const [, prefix, pathPart] = prefixMatch;

          // Skip if source doesn't match prefix
          if (prefix !== source) {
            continue;
          }

          // Match against the path part
          if (relativePath.startsWith(pathPart)
            || relativePath === pathPart.replace('.js', '') + '.js') {
            return true;
          }
        } else {
          // No prefix - match against any source
          if (relativePath.startsWith(filterPath)
            || relativePath === filterPath.replace('.js', '') + '.js') {
            return true;
          }
        }
      }

      return false;
    });
  }

  /**
   * Get relative test path for display
   */
  getRelativeTestPath(testFile, source) {
    if (source === 'bem') {
      return path.relative(path.resolve(__dirname, '../../test'), testFile);
    }
    return path.relative(path.join(this.options.projectDir, 'test'), testFile);
  }

  /**
   * Run a test file (handles both standalone tests and suites)
   */
  async runTestFile(testFile, source) {
    const relativePath = this.getRelativeTestPath(testFile, source);
    let testModule;

    try {
      const searchPaths = [
        path.join(this.options.projectDir, 'functions'),
        path.join(this.options.projectDir, 'functions', 'node_modules'),
        path.resolve(__dirname, '../../'),
      ];
      const origResolve = Module._resolveFilename.bind(Module);
      Module._resolveFilename = function (request, parent, isMain, options) {
        // Try normal resolution first (preserves nested node_modules traversal)
        try {
          return origResolve(request, parent, isMain, options);
        } catch (err) {
          // Fallback: try resolving from project's search paths
          if (!request.startsWith('.') && !path.isAbsolute(request)) {
            const extra = (options && options.paths) ? options.paths : [];
            return origResolve(request, parent, isMain, {
              ...options,
              paths: [...extra, ...searchPaths],
            });
          }
          throw err;
        }
      };
      try {
        testModule = require(testFile);
      } finally {
        Module._resolveFilename = origResolve;
      }
    } catch (error) {
      console.log(chalk.red(`    ✗ ${relativePath}`));
      console.log(chalk.red(`      Failed to load: ${error.message}`));
      this.results.failed++;
      this.results.tests.push({
        path: relativePath,
        passed: false,
        error: `Failed to load: ${error.message}`,
      });
      return;
    }

    // Check if entire file should be skipped
    if (testModule.skip) {
      const skipReason = typeof testModule.skip === 'string' ? testModule.skip : '';
      const description = testModule.description || relativePath;
      console.log(chalk.yellow(`    ○ ${description}`) + chalk.gray(` (skipped${skipReason ? ': ' + skipReason : ''})`));

      this.results.skipped++;
      this.results.tests.push({
        path: relativePath,
        description,
        skipped: true,
        skipReason,
      });
      return;
    }

    // Check if this is a suite/group (has tests array) or standalone test
    if (testModule.type === 'suite' || testModule.type === 'group' || Array.isArray(testModule.tests)) {
      await this.runSuite(testModule, relativePath);
    } else if (Array.isArray(testModule)) {
      // Plain array treated as a group (independent tests)
      await this.runSuite({ type: 'group', tests: testModule }, relativePath);
    } else {
      await this.runStandaloneTest(testModule, relativePath);
    }
  }

  /**
   * Run a test suite with sequential tests and shared state
   */
  async runSuite(suite, relativePath) {
    const suiteDescription = suite.description || relativePath;
    const suiteTimeout = suite.timeout || this.options.timeout;
    const tests = suite.tests || [];

    console.log(chalk.cyan(`    ⤷ ${suiteDescription}`));

    // Shared state across all tests in the suite
    const state = {};

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      const testName = test.name || `step-${i + 1}`;
      const testTimeout = test.timeout || suiteTimeout;
      const auth = test.auth || suite.auth || 'none';

      // Check if test should be skipped
      if (test.skip) {
        const skipReason = typeof test.skip === 'string' ? test.skip : '';
        console.log(chalk.yellow(`      ○ ${testName}`) + chalk.gray(` (skipped${skipReason ? ': ' + skipReason : ''})`));

        this.results.skipped++;
        this.results.tests.push({
          path: `${relativePath}:${testName}`,
          description: testName,
          skipped: true,
          skipReason,
          suite: suiteDescription,
        });
        continue;
      }

      // Create context with shared state
      const context = this.createContext(auth, state);

      const startTime = Date.now();

      try {
        await Promise.race([
          test.run(context),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Test timeout')), testTimeout)
          ),
        ]);

        const duration = Date.now() - startTime;
        console.log(chalk.green(`      ✓ ${testName}`) + chalk.gray(` (${duration}ms)`));

        this.results.passed++;
        this.results.tests.push({
          path: `${relativePath}:${testName}`,
          description: testName,
          passed: true,
          duration,
          suite: suiteDescription,
        });

        // Run cleanup if defined
        if (test.cleanup) {
          try {
            await test.cleanup(context);
          } catch (cleanupError) {
            console.log(chalk.yellow(`        ⚠ Cleanup failed: ${cleanupError.message}`));
          }
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        // Check for runtime skip (test called skip())
        if (error.name === 'SkipError') {
          const skipReason = error.message;
          console.log(chalk.yellow(`      ○ ${testName}`) + chalk.gray(` (skipped: ${skipReason})`));

          this.results.skipped++;
          this.results.tests.push({
            path: `${relativePath}:${testName}`,
            description: testName,
            skipped: true,
            skipReason,
            duration,
            suite: suiteDescription,
          });

          // For suites (sequential, state-dependent tests), a skip on any step means
          // subsequent steps can't run cleanly — propagate skip to the rest of the suite.
          // Groups (independent tests) continue normally.
          const shouldStopOnSkip = suite.type !== 'group' && suite.stopOnFailure !== false;
          if (shouldStopOnSkip) {
            const remaining = tests.length - i - 1;
            if (remaining > 0) {
              console.log(chalk.yellow(`        Skipping ${remaining} remaining test(s) in suite (suite-level skip)`));
              this.results.skipped += remaining;
            }
            break;
          }

          continue;
        }

        console.log(chalk.red(`      ✗ ${testName}`) + chalk.gray(` (${duration}ms)`));
        console.log(chalk.red(`        ${error.message}`));

        this.results.failed++;
        this.results.tests.push({
          path: `${relativePath}:${testName}`,
          description: testName,
          passed: false,
          duration,
          error: error.message,
          suite: suiteDescription,
        });

        // Stop the suite on first failure (sequential tests depend on each other)
        // Groups (type: 'group') continue running all tests regardless of failures
        const shouldStopOnFailure = suite.type !== 'group' && suite.stopOnFailure !== false;
        if (shouldStopOnFailure) {
          const remaining = tests.length - i - 1;
          if (remaining > 0) {
            console.log(chalk.yellow(`        Skipping ${remaining} remaining test(s) in suite`));
            this.results.skipped += remaining;
          }
          break;
        }
      }
    }

    // Run suite-level cleanup
    if (suite.cleanup) {
      try {
        const context = this.createContext('admin', state);
        await suite.cleanup(context);
      } catch (cleanupError) {
        console.log(chalk.yellow(`      ⚠ Suite cleanup failed: ${cleanupError.message}`));
      }
    }
  }

  /**
   * Run a standalone test
   */
  async runStandaloneTest(testModule, relativePath) {
    const description = testModule.description || relativePath;
    const timeout = testModule.timeout || this.options.timeout;
    const auth = testModule.auth || testModule.authLevel || 'none';

    // Create context (no shared state for standalone tests)
    const context = this.createContext(auth);

    const startTime = Date.now();

    try {
      await Promise.race([
        testModule.run(context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Test timeout')), timeout)
        ),
      ]);

      const duration = Date.now() - startTime;
      console.log(chalk.green(`    ✓ ${description}`) + chalk.gray(` (${duration}ms)`));

      this.results.passed++;
      this.results.tests.push({
        path: relativePath,
        description,
        passed: true,
        duration,
      });

      // Run cleanup if defined
      if (testModule.cleanup) {
        try {
          await testModule.cleanup(context);
        } catch (cleanupError) {
          console.log(chalk.yellow(`      ⚠ Cleanup failed: ${cleanupError.message}`));
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      // Check for runtime skip (test called skip())
      if (error.name === 'SkipError') {
        const skipReason = error.message;
        console.log(chalk.yellow(`    ○ ${description}`) + chalk.gray(` (skipped: ${skipReason})`));

        this.results.skipped++;
        this.results.tests.push({
          path: relativePath,
          description,
          skipped: true,
          skipReason,
          duration,
        });
        return;
      }

      console.log(chalk.red(`    ✗ ${description}`) + chalk.gray(` (${duration}ms)`));
      console.log(chalk.red(`      ${error.message}`));

      this.results.failed++;
      this.results.tests.push({
        path: relativePath,
        description,
        passed: false,
        duration,
        error: error.message,
      });
    }
  }

  /**
   * Create test context with all utilities
   * @param {string} auth - Default auth level: 'admin', 'basic', 'premium-active', 'premium-expired', 'none'
   * @param {object} state - Shared state object (for suites)
   */
  createContext(auth, state) {
    // Create HTTP client with accounts for as() method
    // Use hosting URL for all requests (rewrites to bm_api function)
    const http = new HttpClient({
      apiUrl: this.options.apiUrl,
      timeout: this.options.timeout,
      accounts: this.accounts,
      backendManagerKey: this.options.backendManagerKey,
      backendManagerWebhookKey: this.options.backendManagerWebhookKey,
    });

    // Set default auth
    if (auth === 'admin') {
      http.setAuth('backendManagerKey', { key: this.options.backendManagerKey });
    } else if (auth === 'none') {
      http.setAuth('none');
    } else if (auth === 'user') {
      // Alias for basic
      if (this.accounts?.basic?.privateKey) {
        http.setAuth('privateKey', { privateKey: this.accounts.basic.privateKey });
      }
    } else if (this.accounts?.[auth]?.privateKey) {
      // Dynamic lookup — any account type with a privateKey
      http.setAuth('privateKey', { privateKey: this.accounts[auth].privateKey });
    } else {
      http.setAuth('none');
    }

    // Create firestore helper (only if admin SDK available)
    const firestore = this.options.admin
      ? this.createFirestoreHelper()
      : null;

    // Create waitFor helper
    const waitFor = this.createWaitFor();

    // Create pubsub helper
    const pubsub = this.createPubSubHelper();

    // Skip function for runtime skipping
    const skip = (reason) => {
      throw new SkipError(reason);
    };

    // Precomputed map of BEM product id → Stripe-compatible product ID for tests.
    // Falls back to the "_test_<id>" sentinel when no real Stripe product is configured,
    // letting the Stripe resolver match it back to the BEM product. SSOT for tests that
    // need to construct Stripe-shaped webhook payloads (cancel, refund, plan-change, etc.).
    const products = this.config.payment?.products || [];
    const stripeProductIds = Object.fromEntries(
      products.map((p) => [p.id, p.stripe?.productId || `_test_${p.id}`])
    );

    return {
      http,
      accounts: this.accounts,
      assert: assertions,
      state: state || {},
      firestore,
      waitFor,
      pubsub,
      skip,
      admin: this.config.admin,
      // Real BEM Manager + assistant, booted by run-tests.js with BEM_TEST_RUNNER=1.
      // Tests can call Manager.AI(), Manager.Email(), Manager.User(), etc. exactly
      // like production code — no stubs.
      Manager: this.config.Manager,
      assistant: this.config.assistant,
      rules: this.rulesContext,
      config: this.config,
      payments: { stripeProductIds },
    };
  }

  /**
   * Create Firestore helper for direct database access
   */
  createFirestoreHelper() {
    const admin = this.options.admin;
    const db = admin.firestore();

    return {
      /**
       * Get a document
       * @param {string} docPath - Document path (e.g., 'users/abc123')
       * @returns {Promise<object|null>} Document data or null
       */
      async get(docPath) {
        const doc = await db.doc(docPath).get();
        return doc.exists ? doc.data() : null;
      },

      /**
       * Check if a document exists
       * @param {string} docPath - Document path
       * @returns {Promise<boolean>}
       */
      async exists(docPath) {
        const doc = await db.doc(docPath).get();
        return doc.exists;
      },

      /**
       * Set a document
       * @param {string} docPath - Document path
       * @param {object} data - Data to set
       * @param {object} options - Firestore set options
       */
      async set(docPath, data, options) {
        await db.doc(docPath).set(data, options || {});
      },

      /**
       * Delete a document
       * @param {string} docPath - Document path
       */
      async delete(docPath) {
        await db.doc(docPath).delete();
      },

      /**
       * Query a collection
       * @param {string} collectionPath - Collection path
       * @returns {object} Firestore collection reference
       */
      collection(collectionPath) {
        return db.collection(collectionPath);
      },
    };
  }

  /**
   * Create waitFor helper for polling conditions
   */
  createWaitFor() {
    /**
     * Wait for a condition to be true
     * @param {Function} condition - Async function that returns truthy when ready
     * @param {number} timeoutMs - Maximum time to wait (default 5000)
     * @param {number} intervalMs - Polling interval (default 100)
     * @returns {Promise<*>} The truthy value returned by condition
     */
    return async function waitFor(condition, timeoutMs, intervalMs) {
      timeoutMs = timeoutMs || 5000;
      intervalMs = intervalMs || 100;

      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        try {
          const result = await condition();
          if (result) {
            return result;
          }
        } catch (error) {
          // Condition threw - keep polling
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }

      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    };
  }

  /**
   * Create PubSub helper for triggering scheduled functions
   */
  createPubSubHelper() {
    const config = this.config;

    return {
      /**
       * Trigger a Firebase scheduled function via PubSub
       * @param {string} functionName - The function name (e.g., 'bm_cronDaily')
       * @returns {Promise<string>} The message ID
       */
      async trigger(functionName) {
        const { PubSub } = require('@google-cloud/pubsub');
        const pubsub = new PubSub({
          projectId: config.firebaseConfig?.projectId,
          apiEndpoint: 'localhost:8085',
        });

        const topicName = `firebase-schedule-${functionName}`;

        // Get or create the topic (emulator may not have it yet)
        let topic = pubsub.topic(topicName);
        const [exists] = await topic.exists();

        if (!exists) {
          [topic] = await pubsub.createTopic(topicName);
        }

        const messageId = await topic.publishMessage({ json: {} });
        return messageId;
      },
    };
  }

  /**
   * Report final results
   */
  reportResults() {
    const total = this.results.passed + this.results.failed + this.results.skipped;
    const duration = Date.now() - this.results.startTime;

    console.log('\n  ' + chalk.bold('Results'));
    console.log(`    ${chalk.green(`${this.results.passed} passing`)}`);

    if (this.results.failed > 0) {
      console.log(`    ${chalk.red(`${this.results.failed} failing`)}`);
    }

    if (this.results.skipped > 0) {
      console.log(`    ${chalk.yellow(`${this.results.skipped} skipped`)}`);
    }

    console.log(chalk.gray(`\n    Total: ${total} tests in ${duration}ms\n`));
  }
}

module.exports = TestRunner;
