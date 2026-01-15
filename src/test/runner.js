const path = require('path');
const jetpack = require('fs-jetpack');
const chalk = require('chalk');

const HttpClient = require('./utils/http-client.js');
const assertions = require('./utils/assertions.js');
const testAccounts = require('./test-accounts.js');
const rulesClient = require('./utils/firestore-rules-client.js');

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
    // Set testing flag to skip external API calls (emails, SendGrid)
    process.env.BEM_TESTING = 'true';

    this.results.startTime = Date.now();

    console.log(chalk.bold('\n  BEM Integration Tests\n'));

    // Warn if TEST_EXTENDED_MODE is enabled
    if (process.env.TEST_EXTENDED_MODE) {
      console.log(chalk.yellow.bold('  ⚠️⚠️⚠️  WARNING: TEST_EXTENDED_MODE IS TRUE  ⚠️⚠️⚠️'));
      console.log(chalk.yellow('  External API calls (emails, SendGrid, etc.) are ENABLED!'));
      console.log(chalk.yellow('  This will send real emails and make real API calls.\n'));
    }

    // Validate configuration
    if (!this.validateConfig()) {
      return this.results;
    }

    // Health check (use basic http client without accounts)
    // Use hosting URL for all requests (rewrites to bm_api function)
    const healthHttp = new HttpClient({
      hostingUrl: this.options.hostingUrl,
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
    const projectTestsDir = path.join(this.options.projectDir, 'test', 'bem');

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

    // Clean up test accounts from marketing providers (SendGrid/Beehiiv)
    // Run at end of tests so auth:on-create has time to complete
    if (process.env.TEST_EXTENDED_MODE) {
      console.log('');
      process.stdout.write(chalk.gray('  Cleaning test accounts from marketing providers... '));
      const cleanupResult = await testAccounts.cleanupMarketingProviders(this.options.domain, {
        apiUrl: this.options.apiUrl,
        backendManagerKey: this.options.backendManagerKey,
      });
      console.log(chalk.green(`✓ (${cleanupResult.cleaned} cleaned)`));
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
    if (!this.options.hostingUrl) {
      console.log(chalk.red('  ✗ Missing hostingUrl'));
      console.log(chalk.gray('    Set BEM_HOSTING_URL environment variable or pass --url flag'));
      return false;
    }

    if (!this.options.backendManagerKey) {
      console.log(chalk.red('  ✗ Missing backendManagerKey'));
      console.log(chalk.gray('    Set BEM_BACKEND_MANAGER_KEY environment variable or pass --key flag'));
      return false;
    }

    if (!this.options.appId) {
      console.log(chalk.red('  ✗ Missing appId'));
      console.log(chalk.gray('    Could not determine app ID from configuration'));
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
      const response = await http.command('test:health', {});

      if (response.success) {
        console.log(chalk.green('✓'));
        return true;
      }

      console.log(chalk.red('✗'));
      console.log(chalk.red(`  Server not responding: ${response.error}`));
      console.log(chalk.gray(`  Make sure your functions are deployed and running at ${this.options.hostingUrl}`));
      return false;
    } catch (error) {
      console.log(chalk.red('✗'));
      console.log(chalk.red(`  Health check failed: ${error.message}`));
      return false;
    }
  }

  /**
   * Setup test accounts - deletes existing test users and recreates them fresh
   */
  async setupAccounts() {
    // Ensure meta/stats doc exists (required for on-create batch writes)
    process.stdout.write(chalk.gray('  Ensuring meta/stats doc exists... '));
    await this.ensureMetaStats();
    console.log(chalk.green('✓'));

    // Delete existing test user documents to ensure clean state
    process.stdout.write(chalk.gray('  Deleting existing test users... '));
    const deleteResult = await testAccounts.deleteTestUsers(this.options.admin);
    console.log(chalk.green(`✓ (${deleteResult.deleted} deleted, ${deleteResult.skipped} skipped)`));

    process.stdout.write(chalk.gray('  Creating test accounts... '));

    // Create fresh test accounts
    // Called directly with admin SDK - no HTTP call needed
    const result = await testAccounts.ensureAccountsExist(
      this.options.admin,
      this.options.domain
    );

    if (!result.success) {
      console.log(chalk.red(`\n  ✗ Failed to setup accounts: ${result.errors?.map(e => e.error).join(', ')}`));
      return false;
    }

    console.log(chalk.green(`✓ (${result.created} created)`));

    // Fetch account privateKeys
    this.accounts = await testAccounts.fetchPrivateKeys(this.options.admin, this.options.domain);

    // Initialize rules testing context for security rules tests
    process.stdout.write(chalk.gray('  Initializing rules testing context... '));
    try {
      this.rulesContext = await rulesClient.createRulesContext({
        projectId: this.options.projectId,
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
   * Ensure meta/stats document exists (required for user count increments)
   * Creates with initial values if missing, does not overwrite existing
   */
  async ensureMetaStats() {
    const admin = this.options.admin;
    const statsRef = admin.firestore().doc('meta/stats');

    const doc = await statsRef.get();
    if (doc.exists) {
      return; // Already exists, don't overwrite
    }

    // Create initial stats document
    await statsRef.set({
      users: { total: 0 },
      app: this.options.appId,
    });
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
    return path.relative(path.join(this.options.projectDir, 'test', 'bem'), testFile);
  }

  /**
   * Run a test file (handles both standalone tests and suites)
   */
  async runTestFile(testFile, source) {
    const relativePath = this.getRelativeTestPath(testFile, source);
    let testModule;

    try {
      testModule = require(testFile);
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
      hostingUrl: this.options.hostingUrl,
      timeout: this.options.timeout,
      accounts: this.accounts,
      backendManagerKey: this.options.backendManagerKey,
    });

    // Set default auth
    switch (auth) {
      case 'admin':
        http.setAuth('backendManagerKey', { key: this.options.backendManagerKey });
        break;
      case 'basic':
      case 'user':
        if (this.accounts?.basic?.privateKey) {
          http.setAuth('privateKey', { privateKey: this.accounts.basic.privateKey });
        }
        break;
      case 'premium-active':
        if (this.accounts?.['premium-active']?.privateKey) {
          http.setAuth('privateKey', { privateKey: this.accounts['premium-active'].privateKey });
        }
        break;
      case 'premium-expired':
        if (this.accounts?.['premium-expired']?.privateKey) {
          http.setAuth('privateKey', { privateKey: this.accounts['premium-expired'].privateKey });
        }
        break;
      case 'none':
      default:
        http.setAuth('none');
        break;
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
      rules: this.rulesContext,
      config: this.config,
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
          projectId: config.projectId,
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
