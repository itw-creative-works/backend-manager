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
    const ui = this.ui;

    // Load config
    await this.loadConfig();

    // Resolve retry limit from --retry flag (default 1 = no retry)
    const maxAttempts = Math.max(1, parseInt(self.argv.retry, 10) || 1);

    // Run setup, retrying up to maxAttempts times until all tests pass
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt++;

      if (maxAttempts > 1) {
        ui.section(`Attempt ${attempt}/${maxAttempts}`);
      }

      // Reset counters so each attempt starts fresh
      self.testCount = 0;
      self.testTotal = 0;
      self.warnCount = 0;

      await this.runSetup();

      const allPassed = self.testCount + self.warnCount === self.testTotal;
      if (allPassed) {
        return;
      }

      if (attempt < maxAttempts) {
        ui.status('warn', `Attempt ${attempt}/${maxAttempts} had failures — retrying…`);
      } else if (maxAttempts > 1) {
        ui.status('warn', `Reached retry limit (${maxAttempts}) — some checks still failing`);
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
    const ui = this.ui;
    let cwd = jetpack.cwd();

    // OMEGA-style banner. Replaces the old `---- RUNNING SETUP ---- ` line.
    ui.banner(`Backend Manager ${chalk.dim(`v${self.default.version}`)}`);

    // Fresh summary collector for this run (the test runner records into it and
    // prints it on a hard failure; we print it here on success).
    self.setupSummary = new ui.Summary().start();

    // Initial load — returns {} for missing files so scaffold checks can run.
    this.loadFiles();

    // Check if package exists
    if (!hasContent(self.package)) {
      ui.status('fail', `Missing ${chalk.bold('functions/package.json')}`);
      ui.note(`Run ${chalk.bold('npx mgr setup')} from inside the ${chalk.bold('functions')} folder of a Firebase project.`);
      process.exit(1);
    }

    // Check if we're running from the functions folder
    if (!cwd.endsWith('functions') && !cwd.endsWith('functions/')) {
      ui.status('fail', `Wrong directory`);
      ui.note(`Run ${chalk.bold('npx mgr setup')} from the ${chalk.bold('functions')} folder. Try ${chalk.bold('cd functions')} first.`);
      process.exit(1);
    }

    // One unified scaffold pass: config files, package.json fixes, doc defaults.
    // Everything that creates/fixes files goes here, BEFORE any code reads from
    // them. One reload afterwards picks up the final state.
    ui.section('Defaults');
    this.scaffoldConfigs();
    this.scaffoldPackageJson();
    this.copyDefaults();
    this.loadFiles();

    // Clean up leftover trigger files + stale log files from older BEM versions
    this.cleanupGeneratedArtifacts();

    // Load the rules files (reads from BEM's own templates/, not consumer files)
    this.getRulesFile();
    self.default.rulesVersionRegex = new RegExp(`///---version=${self.default.version}---///`);

    // Resolve project info — safe now, scaffoldConfigs guarantees these exist.
    self.projectId = self.firebaseRC.projects.default;
    self.projectUrl = `https://console.firebase.google.com/project/${self.projectId}`;
    self.apiUrl = `https://api.${(self.bemConfigJSON.brand?.url || '').replace(/^https?:\/\//, '')}`;

    // Divider-wrapped header with the project name + Firebase console link.
    const brandName = self.bemConfigJSON.brand?.name || self.projectId;
    ui.header(brandName, { subtitle: self.projectUrl });
    ui.blank();
    ui.field('Project', self.projectId, { pad: 9 });
    ui.field('API', self.apiUrl, { pad: 9, valueColor: chalk.cyan });

    // Run all tests
    ui.section('Checks');
    await this.runTests();

    // Warn if using local backend-manager
    const bemDep = self.package.dependencies?.['backend-manager']
      || self.package.devDependencies?.['backend-manager']
      || '';
    if (bemDep.includes('file:')) {
      ui.section('Notices');
      ui.status('warn', `Using the local ${chalk.bold('backend-manager')} source (file: dependency)`, { level: 2 });
    }

    // Fetch stats
    ui.section('Stats');
    await this.fetchStats();

    // Everything passed (a hard failure would have exited via haltSetup). Print
    // the OMEGA-style summary block.
    self.setupSummary.print();

    // Notify parent if exists
    if (process.send) {
      process.send({
        sender: 'backend-manager',
        command: 'setup:complete',
        payload: {
          passed: self.testCount + self.warnCount === self.testTotal,
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
    const ui = this.ui;
    const defaultsDir = path.resolve(`${__dirname}/../../defaults`);

    if (!jetpack.exists(defaultsDir)) {
      // Defaults dir is optional — older BEM versions didn't have one. If missing, skip silently.
      ui.note('No defaults to scaffold', 2);
      return;
    }

    const { mergeLineBasedFiles } = require('../../utils/merge-line-files.js');
    // Files routed through the marker-based merge (vs verbatim copy / skip-if-exists).
    // .env / .gitignore aren't currently shipped by BEM but are included here so this
    // matches the EM/BXM/UJM contract if we ever add them.
    const MERGEABLE_BASENAMES = new Set(['.env', '.gitignore', 'CLAUDE.md']);

    // Track whether we emitted any line so we can show an "up to date" note when nothing changed.
    let touched = 0;

    const files = jetpack.find(defaultsDir, { matching: '**/*', recursive: true, files: true, directories: false });

    for (const src of files) {
      const rel = path.relative(defaultsDir, src);
      const segments = rel.split(path.sep);

      // Skip "archive" DIRECTORIES — any non-final path segment starting with `_` and
      // followed by a non-`.` character (e.g. `_legacy/`). Matches EM/BXM/UJM convention.
      // The check is restricted to directory segments (all but the last) so a `_`-prefixed
      // FILENAME still ships — e.g. `test/_init.js` copies verbatim (the test runner skips
      // it from discovery on its own). The `_.env` / `_.gitignore` files are likewise not
      // skipped; their leading `_` strips on copy below.
      const dirSegments = segments.slice(0, -1);
      if (dirSegments.some((s) => s.startsWith('_') && !s.startsWith('_.'))) {
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
              ui.status('change', `Merged ${chalk.cyan(target)}`, { level: 2 });
              touched++;
            }
          } catch (e) {
            ui.status('warn', `Failed to merge ${chalk.cyan(target)}`, { detail: e.message, level: 2 });
            touched++;
          }
          continue;
        }

        // Non-mergeable, already exists → preserve consumer's version.
        continue;
      }

      // First time: copy as-is.
      jetpack.copy(src, dest);
      ui.status('add', `Copied ${chalk.cyan(target)}`, { level: 2 });
      touched++;
    }

    if (touched === 0) {
      ui.note('All defaults up to date', 2);
    }
  }

  loadFiles() {
    const self = this.main;
    self.package = loadJSON(`${self.firebaseProjectPath}/functions/package.json`);
    self.firebaseJSON = loadJSON(`${self.firebaseProjectPath}/firebase.json`);
    self.firebaseRC = loadJSON(`${self.firebaseProjectPath}/.firebaserc`);
    self.remoteconfigJSON = loadJSON(`${self.firebaseProjectPath}/functions/remoteconfig.template.json`);
    self.projectPackage = loadJSON(`${self.firebaseProjectPath}/package.json`);
    self.bemConfigJSON = loadJSON(`${self.firebaseProjectPath}/functions/backend-manager-config.json`);
    self.gitignore = jetpack.read(`${self.firebaseProjectPath}/.gitignore`) || '';
  }

  scaffoldPackageJson() {
    const self = this.main;
    const ui = this.ui;

    if (!self.package.engines || !self.package.engines.node) {
      const nodeVer = String(parseInt(process.versions.node, 10));
      self.package.engines = self.package.engines || {};
      self.package.engines.node = nodeVer;
      jetpack.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2));
      ui.status('add', `Added ${chalk.cyan('engines.node')} = ${chalk.bold(nodeVer)} to package.json`, { level: 2 });
    }
  }

  scaffoldConfigs() {
    const self = this.main;
    const ui = this.ui;
    const templatesDir = path.resolve(`${__dirname}/../../../templates`);
    let touched = 0;

    // .firebaserc — resolve project ID from service account or env
    const firebasercPath = `${self.firebaseProjectPath}/.firebaserc`;
    if (!hasContent(self.firebaseRC)) {
      const projectId = this.resolveProjectId();
      jetpack.write(firebasercPath, JSON.stringify({ projects: { default: projectId } }, null, 2) + '\n');
      ui.status('add', `Created ${chalk.cyan('.firebaserc')} (project: ${chalk.bold(projectId)})`, { level: 2 });
      touched++;
    }

    // firebase.json
    const firebaseJsonPath = `${self.firebaseProjectPath}/firebase.json`;
    if (!hasContent(self.firebaseJSON)) {
      const templatePath = path.join(templatesDir, 'firebase.json');
      jetpack.copy(templatePath, firebaseJsonPath);
      ui.status('add', `Created ${chalk.cyan('firebase.json')}`, { level: 2 });
      touched++;
    }

    // backend-manager-config.json
    const bemConfigPath = `${self.firebaseProjectPath}/functions/backend-manager-config.json`;
    if (!hasContent(self.bemConfigJSON)) {
      const templatePath = path.join(templatesDir, 'backend-manager-config.json');
      jetpack.copy(templatePath, bemConfigPath);
      ui.status('add', `Created ${chalk.cyan('functions/backend-manager-config.json')}`, { level: 2 });
      touched++;
    }

    return touched;
  }

  resolveProjectId() {
    const self = this.main;
    const saPath = `${self.firebaseProjectPath}/functions/service-account.json`;

    if (jetpack.exists(saPath)) {
      try {
        const sa = JSON.parse(jetpack.read(saPath));
        if (sa.project_id) {
          return sa.project_id;
        }
      } catch (e) {
        // Fall through
      }
    }

    return process.env.GCLOUD_PROJECT || 'demo-project';
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

    // Expose the total count so the per-check `[N]` prefix can right-align its
    // width (single- vs double-digit indices stay aligned).
    self.testTotalExpected = tests.length;

    // Run each test
    for (const test of tests) {
      await self.test(
        test.getName(),
        async () => {
          return await test.run();
        },
        async () => {
          return await test.fix();
        },
        { details: () => test.getWarning() },
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

    const ui = this.ui;
    if (statsFetchResult instanceof Error) {
      if (statsFetchResult.message.includes('network timeout')) {
        ui.status('skip', 'Skipped stats fetch', { detail: 'network timeout', level: 2 });
      } else {
        ui.status('warn', 'Could not fetch stats endpoint', { detail: statsFetchResult.message, level: 2 });
      }
    } else {
      ui.status('pass', 'Stats fetched/created', { level: 2 });
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
