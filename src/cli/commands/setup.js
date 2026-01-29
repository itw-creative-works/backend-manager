const BaseCommand = require('./base-command');
const chalk = require('chalk');
const jetpack = require('fs-jetpack');
const path = require('path');
const JSON5 = require('json5');
const fetch = require('wonderful-fetch');

// Regex patterns (used by getRulesFile)
const bem_allRulesRegex = /(\/\/\/---backend-manager---\/\/\/)(.*?)(\/\/\/---------end---------\/\/\/)/sgm;

class SetupCommand extends BaseCommand {
  async execute() {
    // Load config
    await this.loadConfig();

    // Run setup
    await this.runSetup();
  }

  async loadConfig() {
    const self = this.main;

    // Load environment variables from .env file
    const envPath = `${self.firebaseProjectPath}/functions/.env`;
    if (jetpack.exists(envPath)) {
      require('dotenv').config({ path: envPath });
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
    self.gitignore = jetpack.read(`${self.firebaseProjectPath}/functions/.gitignore`) || '';

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

    // Clean up leftover trigger files from watch command
    this.cleanupTriggerFiles();

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

  cleanupTriggerFiles() {
    const self = this.main;
    const triggerFile = `${self.firebaseProjectPath}/functions/bem-reload-trigger.js`;

    if (jetpack.exists(triggerFile)) {
      jetpack.remove(triggerFile);
    }
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
    const statsFetchResult = await fetch(`${self.apiUrl}/backend-manager/admin/stats`, {
      method: 'GET',
      timeout: 30000,
      response: 'json',
      query: {
        backendManagerKey: self?.runtimeConfigJSON?.backend_manager?.key,
      },
    })
    .then(json => json)
    .catch(e => e);

    if (statsFetchResult instanceof Error) {
      if (!statsFetchResult.message.includes('network timeout')) {
        this.logWarning(`Ran into error while fetching stats endpoint`, statsFetchResult);
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
