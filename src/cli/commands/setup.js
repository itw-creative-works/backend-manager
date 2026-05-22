const BaseCommand = require('./base-command');
const chalk = require('chalk').default;
const jetpack = require('fs-jetpack');
const path = require('path');
const JSON5 = require('json5');
const fetch = require('wonderful-fetch');

// Regex patterns (used by getRulesFile)
const bem_allRulesRegex = /(\/\/\/---backend-manager---\/\/\/)(.*?)(\/\/\/---------end---------\/\/\/)/sgm;

class SetupCommand extends BaseCommand {
  async execute() {
    const self = this.main;

    // Load config
    await this.loadConfig();

    // Resolve retry limit from --retry flag (default 1 = no retry)
    const maxAttempts = Math.max(1, parseInt(self.argv.retry, 10) || 1);

    // Run setup, retrying up to maxAttempts times until all tests pass
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt++;

      if (maxAttempts > 1) {
        this.logSuccess(`\n==== SETUP ATTEMPT ${attempt}/${maxAttempts} ====`);
      }

      // Reset counters so each attempt starts fresh
      self.testCount = 0;
      self.testTotal = 0;

      await this.runSetup();

      const allPassed = self.testCount === self.testTotal;
      if (allPassed) {
        if (maxAttempts > 1 && attempt > 1) {
          this.logSuccess(`\nAll checks passed on attempt ${attempt}/${maxAttempts}.`);
        }
        return;
      }

      if (attempt < maxAttempts) {
        this.logWarning(`\nAttempt ${attempt}/${maxAttempts} had failures. Retrying...`);
      } else if (maxAttempts > 1) {
        this.logWarning(`\nReached retry limit (${maxAttempts}). Some checks still failing.`);
      }
    }
  }

  async loadConfig() {
    const self = this.main;

    // Load environment variables from .env file
    const envPath = `${self.firebaseProjectPath}/functions/.env`;
    if (jetpack.exists(envPath)) {
      require('dotenv').config({ path: envPath, quiet: true });
    }
  }

  async runSetup() {
    const self = this.main;
    let cwd = jetpack.cwd();

    this.logSuccess(`\n---- RUNNING SETUP v${self.default.version} ----`);

    // Load files
    self.package = loadJSON(`${self.firebaseProjectPath}/functions/package.json`);
    self.firebaseJSON = loadJSON(`${self.firebaseProjectPath}/firebase.json`);
    self.firebaseRC = loadJSON(`${self.firebaseProjectPath}/.firebaserc`);
    self.remoteconfigJSON = loadJSON(`${self.firebaseProjectPath}/functions/remoteconfig.template.json`);
    self.projectPackage = loadJSON(`${self.firebaseProjectPath}/package.json`);
    self.bemConfigJSON = loadJSON(`${self.firebaseProjectPath}/functions/backend-manager-config.json`);
    self.gitignore = jetpack.read(`${self.firebaseProjectPath}/.gitignore`) || '';

    // Check if package exists
    if (!hasContent(self.package)) {
      this.logError(`Missing functions/package.json :(`);
      return;
    }

    // Check if we're running from the functions folder
    if (!cwd.endsWith('functions') && !cwd.endsWith('functions/')) {
      this.logError(`Please run ${chalk.bold('npx bm setup')} from the ${chalk.bold('functions')} folder. Run ${chalk.bold('cd functions')}.`);
      return;
    }

    // Load the rules files
    this.getRulesFile();

    self.default.rulesVersionRegex = new RegExp(`///---version=${self.default.version}---///`);

    // Set project info
    self.projectId = self.firebaseRC.projects.default;
    self.projectUrl = `https://console.firebase.google.com/project/${self.projectId}`;
    self.apiUrl = `https://api.${(self.bemConfigJSON.brand?.url || '').replace(/^https?:\/\//, '')}`;

    // Log
    this.log(`ID: `, chalk.bold(`${self.projectId}`));
    this.log(`URL:`, chalk.bold(`${self.projectUrl}`));

    if (!self.package || !self.package.engines || !self.package.engines.node) {
      throw new Error('Missing <engines.node> in package.json');
    }

    // Clean up leftover trigger files + stale log files from older BEM versions
    this.cleanupGeneratedArtifacts();

    // Copy / merge defaults into consumer project root (matches EM/BXM/UJM pattern).
    // Runs BEFORE tests so any test that inspects scaffolded files sees the merged state.
    this.copyDefaults();

    // Run all tests
    await this.runTests();

    // Log if using local backend-manager
    if (self.package.dependencies['backend-manager'].includes('file:')) {
      this.log('\n' + chalk.yellow(chalk.bold('Warning: ') + 'You are using the local ' + chalk.bold('backend-manager')));
    } else {
      this.log('\n');
    }

    // Fetch stats
    await this.fetchStats();

    // Log results
    this.logSuccess(`Checks finished. Passed ${self.testCount}/${self.testTotal} tests.`);
    if (self.testCount !== self.testTotal) {
      this.logWarning(`You should continue to run ${chalk.bold('npx bm setup')} until you pass all tests and fix all errors.`);
    }

    // Notify parent if exists
    if (process.send) {
      process.send({
        sender: 'electron-manager',
        command: 'setup:complete',
        payload: {
          passed: self.testCount === self.testTotal,
        }
      });
    }
  }

  getRulesFile() {
    const self = this.main;
    self.default.firestoreRulesWhole = (jetpack.read(path.resolve(`${__dirname}/../../../templates/firestore.rules`))).replace('=0.0.0-', `=${self.default.version}-`);
    self.default.firestoreRulesCore = self.default.firestoreRulesWhole.match(bem_allRulesRegex)[0];

    self.default.databaseRulesWhole = (jetpack.read(path.resolve(`${__dirname}/../../../templates/database.rules.json`))).replace('=0.0.0-', `=${self.default.version}-`);
    self.default.databaseRulesCore = self.default.databaseRulesWhole.match(bem_allRulesRegex)[0];
  }

  // Copy default files (src/defaults/**) into the consumer project root.
  // For files in MERGEABLE_BASENAMES, route through `mergeLineBasedFiles` so the
  // framework's section stays live-synced while the consumer's Custom section is
  // preserved verbatim. For non-mergeable files: copy on first setup, skip if exists.
  //
  // Mirrors EM's copyDefaults pattern (src/commands/setup.js in electron-manager).
  // Same marker convention as .env/.gitignore in EM/BXM/UJM:
  //   # ========== Default Values ==========   (framework-owned)
  //   # ========== Custom Values ==========    (consumer-owned)
  copyDefaults() {
    const self = this.main;
    const defaultsDir = path.resolve(`${__dirname}/../../defaults`);

    if (!jetpack.exists(defaultsDir)) {
      // Defaults dir is optional — older BEM versions didn't have one. If missing, skip silently.
      return;
    }

    const { mergeLineBasedFiles } = require('../../utils/merge-line-files.js');
    // Files routed through the marker-based merge (vs verbatim copy / skip-if-exists).
    // .env / .gitignore aren't currently shipped by BEM but are included here so this
    // matches the EM/BXM/UJM contract if we ever add them.
    const MERGEABLE_BASENAMES = new Set(['.env', '.gitignore', 'CLAUDE.md']);

    const files = jetpack.find(defaultsDir, { matching: '**/*', recursive: true, files: true, directories: false });

    for (const src of files) {
      const rel = path.relative(defaultsDir, src);
      const segments = rel.split(path.sep);

      // Skip "archive" directories — anything under a path segment starting with `_` and
      // followed by a non-`.` character. Matches EM/BXM/UJM convention. The `_.env` /
      // `_.gitignore` files are NOT skipped; their leading `_` strips on copy below.
      if (segments.some((s) => s.startsWith('_') && !s.startsWith('_.'))) {
        continue;
      }

      // Convert leading `_.` to `.` so dotfiles ship past npm's filter.
      const target = segments.map((part) => part.startsWith('_.') ? part.slice(1) : part).join(path.sep);
      const dest = path.join(self.firebaseProjectPath, target);
      const basename = path.basename(target);

      if (jetpack.exists(dest)) {
        if (MERGEABLE_BASENAMES.has(basename)) {
          try {
            const existing = jetpack.read(dest, 'utf8');
            const incoming = jetpack.read(src, 'utf8');
            const merged   = mergeLineBasedFiles(existing, incoming, basename);
            if (merged !== existing) {
              jetpack.write(dest, merged);
              this.logSuccess(`Merged default → ${target}`);
            }
          } catch (e) {
            this.logWarning(`Failed to merge ${target}: ${e.message}`);
          }
          continue;
        }

        // Non-mergeable, already exists → preserve consumer's version.
        continue;
      }

      // First time: copy as-is.
      jetpack.copy(src, dest);
      this.logSuccess(`Copied default → ${target}`);
    }
  }

  cleanupGeneratedArtifacts() {
    const self = this.main;

    // Remove the BEM reload-trigger file (transient artifact from `npx mgr watch`)
    const triggerFile = `${self.firebaseProjectPath}/functions/bem-reload-trigger.js`;
    if (jetpack.exists(triggerFile)) {
      jetpack.remove(triggerFile);
    }

    // Sweep stale firebase-tools debug logs + leftover BEM logs from older
    // versions (pre-5.2.2 they lived in functions/; now in .temp/). Shared
    // implementation in base-command.js so emulator/serve boot also runs it.
    this.sweepStaleLogs();
  }

  async runTests() {
    const self = this.main;
    const testRegistry = require('./setup-tests');
    const helpers = require('./setup-tests/helpers');

    // Create test context
    const testContext = {
      main: self,
      package: self.package,
      packageJSON: self.packageJSON,
      gitignore: self.gitignore,
      hasContent: helpers.hasContent,
      isLocal: helpers.isLocal,
      loadJSON: helpers.loadJSON,
    };

    // Get all tests
    const tests = testRegistry.getTests(testContext);

    // Run each test
    for (const test of tests) {
      await self.test(
        test.getName(),
        async () => {
          return await test.run();
        },
        async () => {
          return await test.fix();
        }
      );
    }
  }

  async fetchStats() {
    const self = this.main;
    const url = `${self.apiUrl}/backend-manager/admin/stats`;
    const statsFetchResult = await fetch(url, {
      method: 'GET',
      timeout: 30000,
      response: 'json',
      query: {
        backendManagerKey: process.env.BACKEND_MANAGER_KEY,
      },
    })
    .then(json => json)
    .catch(e => e);

    if (statsFetchResult instanceof Error) {
      if (!statsFetchResult.message.includes('network timeout')) {
        this.logWarning(`Ran into error while fetching stats endpoint (${url})`, statsFetchResult);
      }
    } else {
      this.logSuccess(`Stats fetched/created properly.`);
    }
  }
}

// Helper functions
function loadJSON(path) {
  const contents = jetpack.read(path);
  if (!contents) {
    return {};
  }
  return JSON5.parse(contents);
}

function hasContent(object) {
  return Object.keys(object).length > 0;
}

module.exports = SetupCommand;
