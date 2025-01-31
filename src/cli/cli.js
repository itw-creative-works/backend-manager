// CLI GUIDE:
// https://www.twilio.com/blog/how-to-build-a-cli-with-node-js
// https://www.npmjs.com/package/@dkundel/create-project

// https://www.sitepoint.com/javascript-command-line-interface-cli-node-js/
// https://github.com/sitepoint-editors/ginit

const jetpack = require('fs-jetpack');
const path = require('path');
const chalk = require('chalk');
const _ = require('lodash');
const log = console.log;
const Npm = require('npm-api');
const wonderfulVersion = require('wonderful-version');
const inquirer = require('inquirer');
const JSON5 = require('json5');
const fetch = require('wonderful-fetch');
const argv = require('yargs').argv;
const powertools = require('node-powertools');

// function parseArgumentsIntoOptions(rawArgs) {
//   const args = arg(
//     {
//       '--git': Boolean,
//       '--yes': Boolean,
//       '--install': Boolean,
//       '-g': '--git',
//       '-y': '--yes',
//       '-i': '--install',
//     },
//     {
//       argv: rawArgs.slice(2),
//     }
//   );
//   return {
//     skipPrompts: args['--yes'] || false,
//     git: args['--git'] || false,
//     template: args._[0],
//     runInstall: args['--install'] || false,
//   };
// }

let bem_giRegex = 'Set in .setup()'
let bem_giRegexOuter = /# BEM>>>(.*\n?)# <<<BEM/sg;
let bem_allRulesRegex = /(\/\/\/---backend-manager---\/\/\/)(.*?)(\/\/\/---------end---------\/\/\/)/sgm;
let bem_allRulesDefaultRegex = /(\/\/\/---default-rules---\/\/\/)(.*?)(\/\/\/---------end---------\/\/\/)/sgm;
let bem_allRulesBackupRegex = /({{\s*?backend-manager\s*?}})/sgm;
let MOCHA_PKG_SCRIPT = 'mocha ../test/ --recursive --timeout=10000';
let NPM_CLEAN_SCRIPT = 'rm -fr node_modules && rm -fr package-lock.json && npm cache clean --force && npm install && npm rb';
let NOFIX_TEXT = chalk.red(`There is no automatic fix for this check.`);
let runtimeconfigTemplate = loadJSON(`${__dirname}/../../templates/runtimeconfig.json`);
let bemConfigTemplate = loadJSON(`${__dirname}/../../templates/backend-manager-config.json`);

function Main() {
}

Main.prototype.process = async function (args) {
  const self = this;
  self.options = {};
  self.argv = argv;
  self.firebaseProjectPath = process.cwd();
  self.firebaseProjectPath = self.firebaseProjectPath.match(/\/functions$/) ? self.firebaseProjectPath.replace(/\/functions$/, '') : self.firebaseProjectPath;
  self.testCount = 0;
  self.testTotal = 0;
  self.default = {};
  self.packageJSON = require('../../package.json');
  self.default.version = self.packageJSON.version;

  for (var i = 0; i < args.length; i++) {
    self.options[args[i]] = true;
  }
  // console.log(args);
  // console.log(options);
  if (self.options.v || self.options.version || self.options['-v'] || self.options['-version']) {
    console.log(`Backend manager is version: ${self.default.version}`);
  }

  // https://gist.github.com/timneutkens/f2933558b8739bbf09104fb27c5c9664
  if (self.options.clear) {
    process.stdout.write("\u001b[3J\u001b[2J\u001b[1J");
    console.clear();
    process.stdout.write("\u001b[3J\u001b[2J\u001b[1J");
  }

  // Log CWD
  if (self.options.cwd) {
    console.log('cwd: ', self.firebaseProjectPath);
  }

  // Run setup
  if (self.options.setup) {
    // console.log(`Running Setup`);
    // console.log(`node:`, process.versions.node);
    // console.log(`pwd:`, await execute('pwd').catch(e => e));
    // console.log(`node:`, await execute('node --version').catch(e => e));
    // console.log(`firebase-tools:`, await execute('firebase --version').catch(e => e));
    // console.log('');
    await cmd_configGet(self).catch(e => log(chalk.red(`Failed to run config:get`)));
    await self.setup();
  }

  // Install local BEM
  if ((self.options.i || self.options.install) && (self.options.dev || self.options.development) || self.options.local) {
    await uninstallPkg('backend-manager');
    // return await installPkg('file:../../../ITW-Creative-Works/backend-manager');
    return await installPkg('file:/Users/ian/Developer/Repositories/ITW-Creative-Works/backend-manager');
  }

  // Install live BEM
  if ((self.options.i || self.options.install) && (self.options.prod || self.options.production) || self.options.live) {
    await uninstallPkg('backend-manager');
    return await installPkg('backend-manager');
  }

  // Serve firebase
  if (self.options.serve) {
    if (!self.options.quick && !self.options.q) {
    }
    await cmd_configGet(self);
    await self.setup();

    const port = self.argv.port || _.get(self.argv, '_', [])[1] || '5000';

    // Execute
    await powertools.execute(`firebase serve --port ${port}`, { log: true })
  }

  // Get indexes
  if (self.options['firestore:indexes:get'] || self.options['firestore:indexes'] || self.options['indexes:get']) {
    return await cmd_indexesGet(self, undefined, true);
  }

  // Get config
  if (self.options['functions:config:get'] || self.options['config:get']) {
    return await cmd_configGet(self);
  }

  // Set config
  if (self.options['functions:config:set'] || self.options['config:set']) {
    await cmd_configSet(self);
    return await cmd_configGet(self);
  }

  // Unset config
  if (self.options['functions:config:unset'] || self.options['config:unset'] || self.options['config:delete'] || self.options['config:remove']) {
    await cmd_configUnset(self);
    return await cmd_configGet(self);
  }

  // Get rules
  if (self.options['rules:default'] || self.options['rules:getdefault']) {
    self.getRulesFile();
    console.log(self.default.firestoreRulesWhole.match(bem_allRulesDefaultRegex)[0].replace('    ///', '///'));
    return;
  }

  // Deploy
  if (self.options.deploy) {
    await self.setup();

    // Quick check that not using local packages
    let deps = JSON.stringify(self.package.dependencies)
    let hasLocal = deps.includes('file:');
    if (hasLocal) {
      log(chalk.red(`Please remove local packages before deploying!`));
      return;
    }

    // Execute
    await powertools.execute('firebase deploy', { log: true })
  }

  // Test
  if (self.options['test']) {
    await self.setup();

    // Execute
    // https://stackoverflow.com/questions/9722407/how-do-you-install-and-run-mocha-the-node-js-testing-module-getting-mocha-co
    await powertools.execute(`firebase emulators:exec --only firestore "npx ${MOCHA_PKG_SCRIPT}"`, { log: true })
  }

  // Clean
  if (self.options['clean:npm']) {
    // await self.setup();

    // Execute
    await powertools.execute(`${NPM_CLEAN_SCRIPT}`, { log: true })
  }
};

module.exports = Main;


Main.prototype.getRulesFile = function () {
  const self = this;
  self.default.firestoreRulesWhole = (jetpack.read(path.resolve(`${__dirname}/../../templates/firestore.rules`))).replace('=0.0.0-', `=${self.default.version}-`);
  self.default.firestoreRulesCore = self.default.firestoreRulesWhole.match(bem_allRulesRegex)[0];

  self.default.databaseRulesWhole = (jetpack.read(path.resolve(`${__dirname}/../../templates/database.rules.json`))).replace('=0.0.0-', `=${self.default.version}-`);
  self.default.databaseRulesCore = self.default.databaseRulesWhole.match(bem_allRulesRegex)[0];
};

Main.prototype.setup = async function () {
  const self = this;
  let cwd = jetpack.cwd();

  log(chalk.green(`\n---- RUNNING SETUP v${self.default.version} ----`));

  // Load files
  self.package = loadJSON(`${self.firebaseProjectPath}/functions/package.json`);
  self.firebaseJSON = loadJSON(`${self.firebaseProjectPath}/firebase.json`);
  self.firebaseRC = loadJSON(`${self.firebaseProjectPath}/.firebaserc`);
  self.runtimeConfigJSON = loadJSON(`${self.firebaseProjectPath}/functions/.runtimeconfig.json`);
  self.remoteconfigJSON = loadJSON(`${self.firebaseProjectPath}/functions/remoteconfig.template.json`);
  self.projectPackage = loadJSON(`${self.firebaseProjectPath}/package.json`);
  self.bemConfigJSON = loadJSON(`${self.firebaseProjectPath}/functions/backend-manager-config.json`);
  self.gitignore = jetpack.read(`${self.firebaseProjectPath}/functions/.gitignore`) || '';

  // Check if package exists
  if (!hasContent(self.package)) {
    log(chalk.red(`Missing functions/package.json :(`));
    return;
  }

  // Check if we're running from the functions folder
  if (!cwd.endsWith('functions') && !cwd.endsWith('functions/')) {
    log(chalk.red(`Please run ${chalk.bold('npx bm setup')} from the ${chalk.bold('functions')} folder. Run ${chalk.bold('cd functions')}.`));
    return;
  }

  // Load the rules files
  self.getRulesFile();

  self.default.rulesVersionRegex = new RegExp(`///---version=${self.default.version}---///`)
  // bem_giRegex = new RegExp(jetpack.read(path.resolve(`${__dirname}/../../templates/gitignore.md`)).replace(/\./g, '\\.'), 'm' )
  bem_giRegex = new RegExp(jetpack.read(path.resolve(`${__dirname}/../../templates/gitignore.md`)), 'm' )

  // tests
  self.projectId = self.firebaseRC.projects.default;
  self.projectUrl = `https://console.firebase.google.com/project/${self.projectId}`;

  self.bemApiURL = `https://us-central1-${self?.firebaseRC?.projects?.default}.cloudfunctions.net/bm_api?backendManagerKey=${self?.runtimeConfigJSON?.backend_manager?.key}`;

  // Log
  log(`ID: `, chalk.bold(`${self.projectId}`));
  log(`URL:`, chalk.bold(`${self.projectUrl}`));

  if (!self.package || !self.package.engines || !self.package.engines.node) {
    throw new Error('Missing <engines.node> in package.json')
  }

  // Tests
  await self.test('is a firebase project', async function () {
    let exists = jetpack.exists(`${self.firebaseProjectPath}/firebase.json`);

    return exists;
  }, fix_isFirebase);

  // Test: Is the project using the correct version of Node.js
  await self.test(`using at least Node.js v${self.packageJSON.engines.node}`, function () {
    const engineReqVer = self.packageJSON.engines.node;
    const engineHasVer = self.package.engines.node;
    const processVer = process.versions.node;

    // Check if the process version is less than the required version
    if (wonderfulVersion.is(processVer, '<', engineReqVer)) {
      return new Error(`Please use at least version ${engineReqVer} of Node.js with this project. You need to update your package.json and your .nvmrc file. Then, make sure to run ${chalk.bold(`nvm use ${engineReqVer}`)}`)
    }

    // Check if the engine version is less than the required version
    if (!wonderfulVersion.is(engineHasVer, '===', engineReqVer)) {
      console.log(chalk.yellow(`You are using Node.js version ${processVer} but this project suggests ${engineReqVer}.`));
    }

    // Return
    return wonderfulVersion.is(engineHasVer, '>=', engineReqVer);
  }, fix_nodeVersion);

  // Test: Is the project using the correct version of Node.js
  await self.test('.nvmrc file has proper version', async function () {
    const engineReqVer = self.packageJSON.engines.node;
    const nvmrcVer = jetpack.read(`${self.firebaseProjectPath}/functions/.nvmrc`);

    // Check to ensure nvmrc is greater than or equal to the engine version
    return wonderfulVersion.is(nvmrcVer, '>=', engineReqVer);
  }, fix_nvmrc);

  // Test: Does the project have a package.json
  // await self.test('project level package.json exists', async function () {
  //   return !!(self.projectPackage && self.projectPackage.version && self.projectPackage.name);
  // }, fix_projpackage);

  // Test: Does the project have a package.json
  await self.test('functions level package.json exists', async function () {
    return !!self.package && !!self.package.dependencies && !!self.package.devDependencies && !!self.package.version;
  }, fix_functionspackage);

  // Test: Does the project have an updated package.json
  // await self.test('functions level package.json has updated version', async function () {
  //   return self.package.version === self.projectPackage.version;
  // }, fix_packageversion);

  // Test: Is the project using the correct version of firebase-admin
  await self.test('using updated firebase-admin', async function () {
    const pkg = 'firebase-admin';
    const latest = self.packageJSON.dependencies['firebase-admin'];
    const mine = self.package.dependencies[pkg];
    const bemv = self.packageJSON.dependencies[pkg];

    // Get level difference
    const levelDifference = wonderfulVersion.levelDifference(latest, mine);

    // Log
    bemPackageVersionWarning(pkg, bemv, latest);

    // Log if major version mismatch
    if (levelDifference === 'major') {
      console.log(chalk.red(`Version ${chalk.bold(latest)} of ${chalk.bold(pkg)} available but you must install this manually because it is a major update.`));
    }

    // Ensure the version is up to date
    return wonderfulVersion.is(mine, '>=', latest) || levelDifference === 'major';
  }, fix_fba);

  // Test: Is the project using the correct version of firebase-functions
  await self.test('using updated firebase-functions', async function () {
    const pkg = 'firebase-functions';
    const latest = self.packageJSON.dependencies['firebase-functions'];
    const mine = self.package.dependencies[pkg];
    const bemv = self.packageJSON.dependencies[pkg];

    // Get level difference
    const levelDifference = wonderfulVersion.levelDifference(latest, mine);

    // Log
    bemPackageVersionWarning(pkg, bemv, latest);

    // Log if major version mismatch
    if (levelDifference === 'major') {
      console.log(chalk.red(`Version ${chalk.bold(latest)} of ${chalk.bold(pkg)} available but you must install this manually because it is a major update.`));
    }

    // Ensure the version is up to date
    return wonderfulVersion.is(mine, '>=', latest) || levelDifference === 'major';
  }, fix_fbf);

  // Test: Is the project using the correct version of backend-manager
  await self.test('using updated backend-manager', async function () {
    const pkg = 'backend-manager';
    const latest = await getPkgVersion(pkg);
    const mine = self.package.dependencies[pkg];

    // Get level difference
    const levelDifference = wonderfulVersion.levelDifference(latest, mine);

    // Log if major version mismatch
    if (!isLocal(mine) && levelDifference === 'major') {
      console.log(chalk.red(`Version ${chalk.bold(latest)} of ${chalk.bold(pkg)} available but you must install this manually because it is a major update.`));
    }

    // Ensure the version is up to date
    return isLocal(mine) || wonderfulVersion.is(mine, '>=', latest) || levelDifference === 'major';
  }, fix_bem);

  // Test: Is the project using the correct version of @firebase/testing
  // await self.test('using updated @firebase/testing', async function () {
  //   let pkg = '@firebase/testing';
  //   let latest = semver.clean(await getPkgVersion(pkg));
  //   let mine = (self.package.devDependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
  //   return isLocal(mine) || !(semver.gt(latest, mine));
  // }, fix_fbTesting);

  // Test: Is the project using the correct version of mocha
  // await self.test('using updated mocha', async function () {
  //   let pkg = 'mocha';
  //   let latest = semver.clean(await getPkgVersion(pkg));
  //   let mine = (self.package.devDependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
  //   return isLocal(mine) || !(semver.gt(latest, mine));
  // }, fix_mocha);

  // Test: Does the project have a "npm start" script
  await self.test(`has "npm start" script`, function () {
    return self.package.scripts.start
  }, fix_startScript);

  // Test: Does the project have a "npm dist" script
  await self.test(`has "npm dist" script`, function () {
    return self.package.scripts.dist
  }, fix_distScript);

  // Test: Is the project using a proper .runtimeconfig
  await self.test('using proper .runtimeconfig', async function () {
    // Set pass
    let pass = true;

    // Loop through all the keys in the template
    powertools.getKeys(runtimeconfigTemplate).forEach((key) => {
      const userValue = _.get(self.runtimeConfigJSON, key, undefined);

      // If the user value is undefined, then we need to set pass to false
      if (typeof userValue === 'undefined') {
        pass = false;
      }
    });

    // Return result
    return pass;
  }, fix_runtimeConfig);

  // Test: Is the project using a proper backend-manager-config.json
  await self.test('using proper backend-manager-config.json', async function () {
    // Set pass
    let pass = true;

    // Loop through all the keys in the template
    powertools.getKeys(bemConfigTemplate).forEach((key) => {
      const userValue = _.get(self.bemConfigJSON, key, undefined);

      // If the user value is undefined, then we need to set pass to false
      if (typeof userValue === 'undefined') {
        pass = false;
      }
    });

    // Return result
    return pass;
  }, fix_bemConfig);

  // Test: Does the project have the correct ID in backend-manager-config.json
  await self.test('has correct ID in backend-manager-config.json', async function () {
    // Check if the project name matches the projectId
    if (self.projectId !== self.bemConfigJSON?.firebaseConfig?.projectId) {
      console.error(chalk.red('Mismatch between project name and firebaseConfig.projectId in backend-manager-config.json'));
      return false;
    }

    // Return pass
    return true;
  }, NOFIX);

  // Test: Does the project have the correct ID in service-account.json
  await self.test('has correct service-account.json', function () {
    let serviceAccount = jetpack.read(`${self.firebaseProjectPath}/functions/service-account.json`);

    // Make sure the service account exists
    if (!serviceAccount) {
      console.error(chalk.red('Missing service-account.json'));
      return false;
    }

    // Parse the service account
    serviceAccount = JSON5.parse(serviceAccount);

    // Check if project_id matches the project's ID
    if (self.projectId !== serviceAccount.project_id) {
      console.error(chalk.red('Mismatch between project name and service account project_id'));
      return false;
    }

    return true;
  }, fix_serviceAccount);

  // Test: Does the project have the correct .gitignore
  await self.test('has correct .gitignore', function () {
    let match = self.gitignore.match(bem_giRegexOuter);
    if (!match) {
      return false;
    } else {
      let gitignore = jetpack.read(path.resolve(`${__dirname}/../../templates/gitignore.md`));
      let file = gitignore.match(bem_giRegexOuter) ? RegExp.$1 : 'BAD1';
      let file2 = match[0].match(bem_giRegexOuter) ? RegExp.$1 : 'BAD2';
      return file === file2;
    }
  }, fix_gitignore);

  // Test: Does the project have the correct firestore rules
  await self.test('firestore rules in JSON', () => {
    return self.firebaseJSON?.firestore?.rules === 'firestore.rules'
  }, fix_firestoreRules);

  // Test: Does the project have the correct firestore indexes
  await self.test('firestore indexes in JSON', () => {
    return self.firebaseJSON?.firestore?.indexes === 'firestore.indexes.json';
  }, fix_firestoreIndexes);

  // Test: Does the project have the correct realtime rules
  await self.test('realtime rules in JSON', () => {
    return self.firebaseJSON?.database?.rules === 'database.rules.json';
  }, fix_realtimeRules);

  // Test: Does the project have the correct storage rules
  await self.test('storage rules in JSON', () => {
    return self.firebaseJSON?.storage?.rules === 'storage.rules';
  }, fix_storageRules);

  // Test: Does the project have the correct remoteconfig template
  await self.test('remoteconfig template in JSON', () => {
    return self.firebaseJSON?.remoteconfig?.template === 'remoteconfig.template.json';
  }, fix_remoteconfigTemplate);

  // Test: Does the project have the indexes synced
  await self.test('firestore indexes synced', async function () {
    const tempPath = '_firestore.indexes.json'
    const liveIndexes = await cmd_indexesGet(self, tempPath, false);

    const localIndexes_exists = jetpack.exists(`${self.firebaseProjectPath}/firestore.indexes.json`);
    let localIndexes
    if (localIndexes_exists) {
      localIndexes = require(`${self.firebaseProjectPath}/firestore.indexes.json`)
    }
    const equal = _.isEqual(liveIndexes, localIndexes);

    if (localIndexes_exists && !equal) {
      console.log(chalk.red(`To fix this...`));
      console.log(chalk.red(`  - ${chalk.bold('npx bm indexes:get')} to overwrite Firestore's local indexes with the live indexes`));
      console.log(chalk.red('  OR'));
      console.log(chalk.red(`  - ${chalk.bold('firebase deploy --only firestore:indexes')} to replace the live indexes.`));
    }

    jetpack.remove(`${self.firebaseProjectPath}/${tempPath}`)

    return !localIndexes_exists || equal
  }, fix_indexesSync);

  // Test: Does the project have the correct importExportAdmin
  // await self.test('add roles/datastore.importExportAdmin', async function () {
  //   const result = await cmd_iamImportExport(self).catch(e => e);
  //   return !(result instanceof Error);
  // }, NOFIX);

  // Test: Does the project have the correct storage lifecycle policy
  await self.test('set storage lifecycle policy', async function () {
    const result = await cmd_setStorageLifecycle(self).catch(e => e);
    return !(result instanceof Error);
  }, fix_setStoragePolicy);

  // Test: Does the project have the correct firestore rules file
  await self.test('update firestore rules file', function () {
    const exists = jetpack.exists(`${self.firebaseProjectPath}/firestore.rules`);
    const contents = jetpack.read(`${self.firebaseProjectPath}/firestore.rules`) || '';
    const containsCore = contents.match(bem_allRulesRegex);
    const matchesVersion = contents.match(self.default.rulesVersionRegex);

    return (exists && !!containsCore && !!matchesVersion);
  }, fix_firestoreRulesFile);

  // Test: Does the project have the correct firestore indexes file
  await self.test('update firestore indexes file', function () {
    const exists = jetpack.exists(`${self.firebaseProjectPath}/firestore.indexes.json`);
    return exists;
  }, fix_firestoreIndexesFile);

  // Test: Does the project have the correct realtime rules file
  await self.test('update realtime rules file', function () {
    const exists = jetpack.exists(`${self.firebaseProjectPath}/database.rules.json`);
    const contents = jetpack.read(`${self.firebaseProjectPath}/database.rules.json`) || '';
    const containsCore = contents.match(bem_allRulesRegex);
    const matchesVersion = contents.match(self.default.rulesVersionRegex);

    return (exists && !!containsCore && !!matchesVersion);
  }, fix_realtimeRulesFile);

  // Test: Does the project have the correct storage rules file
  await self.test('update storage rules file', function () {
    const exists = jetpack.exists(`${self.firebaseProjectPath}/storage.rules`);
    return exists;
  }, fix_storageRulesFile);

  // Test: Does the project have the correct remoteconfig template file
  await self.test('update remoteconfig template file', function () {
    const exists = jetpack.exists(`${self.firebaseProjectPath}/functions/remoteconfig.template.json`);
    return exists;
  }, fix_remoteconfigTemplateFile);

  // Test: Does the project have the correct hosting folder
  await self.test('hosting is set to dedicated folder in JSON', function () {
    const hosting = _.get(self.firebaseJSON, 'hosting', {});
    return (hosting.public && (hosting.public === 'public' || hosting.public !== '.'))
  }, fix_firebaseHostingFolder);

  // Test: Does the project have the correct hosting auth page
  // await self.test('hosting has auth page', async function () {
  //   return await fix_firebaseHostingAuth(self);
  // }, NOFIX);

  // Test: Does the project have the correct backend-manager-tests.js file
  await self.test('update backend-manager-tests.js', function () {
    jetpack.write(`${self.firebaseProjectPath}/test/backend-manager-tests.js`,
      (jetpack.read(path.resolve(`${__dirname}/../../templates/backend-manager-tests.js`)))
    )
    return true;
  }, NOFIX);

  // Test: Does the project have the correct public .html files
  await self.test('create public .html files', function () {
    const options = {url: self.bemConfigJSON.brand.url}
    // index.html
    const templateIndex = jetpack.read(path.resolve(`${__dirname}/../../templates/public/index.html`));
    jetpack.write(`${self.firebaseProjectPath}/public/index.html`,
      powertools.template(templateIndex, options)
    )

    // 404.html
    const template404 = jetpack.read(path.resolve(`${__dirname}/../../templates/public/404.html`));
    jetpack.write(`${self.firebaseProjectPath}/public/404.html`,
      powertools.template(template404, options)
    )
    return true;
  }, NOFIX);

  // await self.test('add roles/datastore.importExportAdmin', function () {
  //   const result = await cmd_iamImportExport(self);
  //   console.log('---result', result);
  //   return true;
  // }, NOFIX);

  // await self.test('has mocha package.json script', function () {
  //   let script = _.get(self.package, 'scripts.test', '')
  //   return script === MOCHA_PKG_SCRIPT;
  // }, fix_mochaScript);

  // await self.test('has clean:npm package.json script', function () {
  //   let script = _.get(self.package, 'scripts.clean:npm', '')
  //   return script === NPM_CLEAN_SCRIPT;
  // }, fix_cleanNpmScript);

  // Log if using local backend-manager
  if (self.package.dependencies['backend-manager'].includes('file:')) {
    console.log('\n' + chalk.yellow(chalk.bold('Warning: ') + 'You are using the local ' + chalk.bold('backend-manager')));
  } else {
    console.log('\n');
  }

  // Fetch stats
  const statsFetchResult = await fetch(self.bemApiURL, {
    method: 'post',
    timeout: 30000,
    response: 'json',
    body: {
      command: 'admin:get-stats',
    },
  })
  .then(json => json)
  .catch(e => e);

  // Check if we ran into an error
  if (statsFetchResult instanceof Error) {
    if (!statsFetchResult.message.includes('network timeout')) {
      console.log(chalk.yellow(`Ran into error while fetching stats endpoint`, statsFetchResult));
    }
  } else {
    // console.log(chalk.green(`Stats fetched/created properly.`, JSON.stringify(statsFetchResult)));
    console.log(chalk.green(`Stats fetched/created properly.`));
  }

  // Log
  console.log(chalk.green(`Checks finished. Passed ${self.testCount}/${self.testTotal} tests.`));
  if (self.testCount !== self.testTotal) {
    console.log(chalk.yellow(`You should continue to run ${chalk.bold('npx bm setup')} until you pass all tests and fix all errors.`));
  }

  // Notify parent that finished with test results
  if (process.send) {
    process.send({
      sender: 'electron-manager',
      command: 'setup:complete',
      payload: {
        passed: self.testCount === self.testTotal,
      }
    });
  }

  return;

};

Main.prototype.test = async function(name, fn, fix, args) {
  const self = this;
  let status;

  return new Promise(async function(resolve, reject) {
    let passed = await fn();

    if (passed instanceof Error) {
      log(chalk.red(passed));
      process.exit(0);
    } else if (passed) {
      status = chalk.green('passed');
      self.testCount++;
      self.testTotal++;
    } else {
      status = chalk.red('failed');
      self.testTotal++;
    }
    log(chalk.bold(`[${self.testTotal}]`), `${name}:`, status);
    if (!passed) {
      log(chalk.yellow(`Fixing...`));
      fix(self, args)
      .then((r) => {
        log(chalk.green(`...done~!`));
        resolve();
      })
      .catch((e) => {
        if (self.options['--continue']) {
          log(chalk.yellow('⚠️ Continuing despite error because of --continue flag\n'));
          setTimeout(function () {
            resolve();
          }, 5000);
        } else {
          log(chalk.yellow('To force the setup to continue, run with the --continue flag\n'));
          reject();
        }
      })
    } else {
      resolve();
    }
  });
}

// FIXES
function NOFIX() {
  return new Promise(function(resolve, reject) {
    log(NOFIX_TEXT);
    reject();
  });
}

function bemPackageVersionWarning(package, current, latest) {
  if (wonderfulVersion.greaterThan(latest, current)) {
    log(chalk.yellow(`${package} needs to be updated in backend-manager: ${current} => ${latest}`));
  }
}

async function fix_runtimeConfig(self) {
  return new Promise(function(resolve, reject) {
    // Log
    log(NOFIX_TEXT);
    log(chalk.red(`You need to run ${chalk.bold(`npx bm config:set`)} for each of these keys:`));

    // Log what keys are missing
    powertools.getKeys(runtimeconfigTemplate).forEach((key) => {
      const userValue = _.get(self.runtimeConfigJSON, key, undefined);

      if (typeof userValue === 'undefined') {
        log(chalk.red.bold(`${key}`));
      } else {
        log(chalk.red(`${key} (${userValue})`));
      }
    });

    // Reject
    reject();
  });
};

async function fix_bemConfig(self) {
  return new Promise(function(resolve, reject) {
    // Log
    log(NOFIX_TEXT);
    log(chalk.red(`You need to open backend-manager-config.json and set each of these keys:`));

    // Write if it doesnt exist
    if (!hasContent(self.bemConfigJSON)) {
      // jetpack.write(`${self.firebaseProjectPath}/functions/backend-manager-config.json`, bemConfigTemplate)
      jetpack.write(`${self.firebaseProjectPath}/functions/backend-manager-config.json`, {})
    }

    // Log what keys are missing
    powertools.getKeys(bemConfigTemplate).forEach((key) => {
      const userValue = _.get(self.bemConfigJSON, key, undefined);

      if (typeof userValue === 'undefined') {
        log(chalk.red.bold(`${key}`));
      } else {
        log(chalk.red(`${key} (${userValue})`));
      }
    });

    // Reject
    reject();
  });
};

async function fix_serviceAccount(self) {
  return new Promise(function(resolve, reject) {
    log(NOFIX_TEXT);
    log(chalk.red(`Please install a service account --> ` + chalk.yellow.red(`${self.projectUrl}/settings/serviceaccounts/adminsdk`)));
    reject();
  });
};

// function fix_mochaScript(self) {
//   return new Promise(function(resolve, reject) {
//     _.set(self.package, 'scripts.test', MOCHA_PKG_SCRIPT);
//     jetpack.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2) );
//     resolve();
//   });
// }

function fix_startScript(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.package, 'scripts.start', 'firebase serve');
    jetpack.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2) );
    resolve();
  });
}

function fix_distScript(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.package, 'scripts.dist', 'firebase deploy');
    jetpack.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2) );
    resolve();
  });
}

function fix_setupScript(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.package, 'scripts.setup', 'npx bm setup');
    jetpack.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2) );
    resolve();
  });
}

function fix_nodeVersion(self) {
  return new Promise(function(resolve, reject) {
    if (false) {
      _.set(self.package, 'engines.node', self.packageJSON.engines.node)
      jetpack.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2) );

      resolve();
    }

    throw new Error('Please manually fix your outdated Node.js version')
  });
};

function fix_nvmrc(self) {
  return new Promise(function(resolve, reject) {
    var v = self.packageJSON.engines.node;

    jetpack.write(`${self.firebaseProjectPath}/functions/.nvmrc`, `v${v}/*`);

    log(chalk.red(`Please run ${chalk.bold(`nmv use ${v}`)} to use the correct version of Node.js`));

    throw '';
  });
};

async function fix_isFirebase(self) {
  log(chalk.red(`This is not a firebase project. Please use ${chalk.bold('firebase-init')} to set up.`));
  throw '';
};

function fix_projpackage(self) {
  return new Promise(function(resolve, reject) {
    self.projectPackage = self.projectPackage || {};
    self.projectPackage.name = self.projectPackage.name || self.projectId;
    self.projectPackage.version = self.projectPackage.version || '0.0.1';
    self.projectPackage.dependencies = self.projectPackage.dependencies || {};
    self.projectPackage.devDependencies = self.projectPackage.devDependencies || {};

    jetpack.write(`${self.firebaseProjectPath}/package.json`, JSON.stringify(self.projectPackage, null, 2) );
    resolve();
  });
};

function fix_functionspackage(self) {
  return new Promise(function(resolve, reject) {
    self.package.dependencies = self.package.dependencies || {};
    self.package.devDependencies = self.package.devDependencies || {};
    self.package.version = self.package.version || '0.0.1';

    jetpack.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2) );
    resolve();
  });
};

function fix_packageversion(self) {
  return new Promise(function(resolve, reject) {
    self.package.version = self.projectPackage.version;

    jetpack.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2) );
    resolve();
  });
};

async function fix_fbf(self) {
  // console.log('----FIX FBF'); return Promise.resolve();
  return await installPkg('firebase-functions', `@${self.packageJSON.dependencies['firebase-functions']}`)
};
async function fix_fba(self) {
  // console.log('----FIX FBA'); return Promise.resolve();
  return await installPkg('firebase-admin', `@${self.packageJSON.dependencies['firebase-admin']}`)
};
async function fix_bem(self) {
  await installPkg('backend-manager');

  console.log(chalk.green(`Process has exited since a new version of backend-manager was installed. Run ${chalk.bold('npx bm setup')} again.`));
  process.exit(0);

  return;
};

// async function fix_ujp(self) {
//   return await installPkg('ultimate-jekyll-poster')
// };
// async function fix_fbTesting(self) {
//   return await installPkg('@firebase/testing', '', '--save-dev')
// };
// async function fix_mocha(self) {
//   return await installPkg('mocha', '', '--save-dev')
// };

function fix_gitignore(self) {
  return new Promise(function(resolve, reject) {
    let gi = (jetpack.read(path.resolve(`${__dirname}/../../templates/gitignore.md`)));
    if (self.gitignore.match(bem_giRegexOuter)) {
      self.gitignore = self.gitignore.replace(bem_giRegexOuter, gi);
    } else {
      self.gitignore = gi;
    }
    self.gitignore = self.gitignore.replace(/\n\s*\n$/mg, '\n')
    // self.gitignore = `${self.gitignore}\n${gi}`.replace(/$\n/m,'');
    // self.gitignore = self.gitignore.replace(/$\n/m,'');
    jetpack.write(`${self.firebaseProjectPath}/functions/.gitignore`, self.gitignore);
    resolve();
  });
};

function fix_firestoreRules(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.firebaseJSON, 'firestore.rules', 'firestore.rules')
    jetpack.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_firestoreIndexes(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.firebaseJSON, 'firestore.indexes', 'firestore.indexes.json')
    jetpack.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_realtimeRules(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.firebaseJSON, 'database.rules', 'database.rules.json')
    jetpack.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_storageRules(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.firebaseJSON, 'storage.rules', 'storage.rules')
    jetpack.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_remoteconfigTemplate(self) {
  return new Promise(function(resolve, reject) {

    _.set(self.firebaseJSON, 'remoteconfig.template', 'remoteconfig.template.json')
    jetpack.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_indexesSync(self) {
  return new Promise(function(resolve, reject) {
    inquirer.prompt([
      {
        type: 'confirm',
        name: 'replace',
        message: 'Would you like to replace the local indexes?',
        default: true,
      }
    ])
    .then(async (answer) => {
      if (answer.replace) {
        cmd_indexesGet(self, undefined, true)
        .then(r => {
          return resolve();
        })
      } else {
        return reject();
      }
    })
  });
};

function fix_setStoragePolicy(self) {
  return new Promise(function(resolve, reject) {
    // fetch(self.bemApiURL, {
    //   method: 'post',
    //   timeout: 30000,
    //   response: 'json',
    //   body: {
    //     command: 'admin:backup',
    //   },
    // })
    // .then(json => {
    //   console.log('Response', json);
    //   return resolve();
    // })
    // .catch(e => {
    //   console.error(chalk.red(`There is no automatic fix. Please run: \n${chalk.bold('firebase deploy && npx bm setup')}`));
    //   return reject();
    // });
    // Log
    console.error(chalk.red(`There is no automatic fix. Please run: \n${chalk.bold('firebase deploy && npx bm setup')}`));

    // Reject
    return reject();
  });
};

function fix_firestoreRulesFile(self) {
  return new Promise(function(resolve, reject) {
    const name = 'firestore.rules'
    const path = `${self.firebaseProjectPath}/${name}`;
    const exists = jetpack.exists(path);
    let contents = jetpack.read(path) || '';

    if (!exists || !contents) {
      log(chalk.yellow(`Writing new ${name} file...`));
      jetpack.write(path, self.default.firestoreRulesWhole)
      contents = jetpack.read(path) || '';
    }

    const hasTemplate = contents.match(bem_allRulesRegex) || contents.match(bem_allRulesBackupRegex);
    if (!hasTemplate) {
      log(chalk.red(`Could not find rules template. Please edit ${name} file and add`), chalk.red(`{{backend-manager}}`), chalk.red(`to it.`));
      return resolve()
    }

    const matchesVersion = contents.match(self.default.rulesVersionRegex);
    if (!matchesVersion) {
      // console.log('replace wih', self.default.firestoreRulesCore);
      contents = contents.replace(bem_allRulesBackupRegex, self.default.firestoreRulesCore)
      contents = contents.replace(bem_allRulesRegex, self.default.firestoreRulesCore)
      jetpack.write(path, contents)
      log(chalk.yellow(`Writing core rules to ${name} file...`));
    }
    resolve();
  });
};

function fix_realtimeRulesFile(self) {
  return new Promise(function(resolve, reject) {
    const name = 'database.rules.json'
    const path = `${self.firebaseProjectPath}/${name}`;
    const exists = jetpack.exists(path);
    let contents = jetpack.read(path) || '';

    if (!exists || !contents) {
      log(chalk.yellow(`Writing new ${name} file...`));
      jetpack.write(path, self.default.databaseRulesWhole)
      contents = jetpack.read(path) || '';
    }

    const hasTemplate = contents.match(bem_allRulesRegex) || contents.match(bem_allRulesBackupRegex);
    if (!hasTemplate) {
      log(chalk.red(`Could not find rules template. Please edit ${name} file and add`), chalk.red(`{{backend-manager}}`), chalk.red(`to it.`));
      return resolve()
    }

    const matchesVersion = contents.match(self.default.rulesVersionRegex);
    if (!matchesVersion) {
      // console.log('replace wih', self.default.databaseRulesCore);
      contents = contents.replace(bem_allRulesBackupRegex, self.default.databaseRulesCore)
      contents = contents.replace(bem_allRulesRegex, self.default.databaseRulesCore)
      jetpack.write(path, contents)
      log(chalk.yellow(`Writing core rules to ${name} file...`));
    }
    resolve();
  });
};

// function fix_realtimeRulesFile(self) {
//   return new Promise(function(resolve, reject) {
//     const name = 'database.rules.json';
//     const filePath = `${self.firebaseProjectPath}/${name}`;
//     const exists = jetpack.exists(filePath);
//     let contents = jetpack.read(filePath) || '';
//
//     if (!exists) {
//       log(chalk.yellow(`Writing new ${name} file...`));
//       jetpack.write(filePath, jetpack.read(path.resolve(`${__dirname}/../../templates/${name}`)))
//       contents = jetpack.read(filePath) || '';
//     }
//
//     resolve();
//   });
// };

function fix_firestoreIndexesFile(self) {
  return new Promise(async function(resolve, reject) {
    const name = 'firestore.indexes.json';
    const filePath = `${self.firebaseProjectPath}/${name}`;
    const exists = jetpack.exists(filePath);

    if (!exists) {
      log(chalk.yellow(`Writing new ${name} file...`));
      await cmd_indexesGet(self, name, false);
    }

    resolve();
  });
};

function fix_storageRulesFile(self) {
  return new Promise(function(resolve, reject) {
    const name = 'storage.rules';
    const filePath = `${self.firebaseProjectPath}/${name}`;
    const exists = jetpack.exists(filePath);
    let contents = jetpack.read(filePath) || '';

    if (!exists) {
      log(chalk.yellow(`Writing new ${name} file...`));
      jetpack.write(filePath, jetpack.read(path.resolve(`${__dirname}/../../templates/${name}`)))
      contents = jetpack.read(filePath) || '';
    }

    resolve();
  });
};

function fix_remoteconfigTemplateFile(self) {
  return new Promise(function(resolve, reject) {
    const name = 'remoteconfig.template.json'
    const filePath = `${self.firebaseProjectPath}/functions/${name}`;
    const exists = jetpack.exists(filePath);
    let contents = jetpack.read(filePath) || '';

    if (!exists) {
      log(chalk.yellow(`Writing new ${name} file...`));
      jetpack.write(filePath, jetpack.read(path.resolve(`${__dirname}/../../templates/${name}`)))
      contents = jetpack.read(filePath) || '';
    }

    resolve();
  });
};


// Hosting
function fix_firebaseHostingFolder(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.firebaseJSON, 'hosting.public', 'public')
    jetpack.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_firebaseHostingAuth(self) {
  return new Promise(async function(resolve, reject) {
    const url = `${self.bemConfigJSON.brand.url}/server/auth/handler`;

    await fetch(url, {
      method: 'get',
      cacheBreaker: true,
      tries: 2,
      response: 'text',
    })
    .then(async (text) => {
      // Save to file
      jetpack.write(`${self.firebaseProjectPath}/public/auth/handler/index.html`, text);

      resolve(true)
    })
    .catch(async (e) => {
      log(chalk.red(`Failed to fetch auth handler. Please ensure it is live @ ${url}.`));

      reject(false)
    })
  });
};

function getPkgVersion(package) {
  return new Promise(async function(resolve, reject) {
    const npm = new Npm();

    npm.repo(package)
    .package()
      .then(function(pkg) {
        resolve(pkg.version);
      }, function(err) {
        resolve('0.0.0');
      });
  });
}

async function cmd_indexesGet(self, filePath, log) {
  return new Promise(async function(resolve, reject) {
    const finalPath = `${self.firebaseProjectPath}/${filePath || 'firestore.indexes.json'}`;
    let existingIndexes;

    // Read existing indexes
    try {
      existingIndexes = require(`${self.firebaseProjectPath}/firestore.indexes.json`)
    } catch (e) {
      if (log !== false) {
        console.error('Failed to read existing local indexes', e);
      }
    }

    // Run the command
    await powertools.execute(`firebase firestore:indexes > ${finalPath}`, { log: true })
      .then((output) => {
        const newIndexes = require(finalPath);

        // Log
        if (log !== false) {
          console.log(chalk.green(`Saving indexes to: ${finalPath}`));

          // Check if the indexes are different
          const equal = _.isEqual(newIndexes, existingIndexes);
          if (!equal) {
            console.log(chalk.red(`The live and local index files did not match and have been overwritten by the ${chalk.bold('live indexes')}`));
          }
        }

        // Return
        return resolve(newIndexes);
      })
      .catch((e) => {
        // Return
        return reject(error);
      });
  });
}

async function cmd_configGet(self, filePath) {
  return new Promise(function(resolve, reject) {
    const finalPath = `${self.firebaseProjectPath}/${filePath || 'functions/.runtimeconfig.json'}`;

    const max = 10;
    let retries = 0;

    async function _attempt() {
      try {
        const output = await powertools.execute(`firebase functions:config:get > ${finalPath}`, { log: true });

        // Log success message
        console.log(chalk.green(`Saving config to: ${finalPath}`));

        // Resolve with the required config
        resolve(require(finalPath));
      } catch (error) {
        console.error(chalk.red(`Failed to get config: ${error}`));

        // Check if retries are exhausted
        if (retries++ >= max) {
          return reject(error);
        }

        // Retry logic with delay
        const delay = 2500 * retries;
        console.error(chalk.yellow(`Retrying config:get ${retries}/${max} in ${delay}ms...`));
        setTimeout(_attempt, delay);
      }
    }

    // Start the attempts
    _attempt();
  });
}

async function cmd_configSet(self, newPath, newValue) {
  return new Promise(async function(resolve, reject) {
    // console.log(self.options);
    // console.log(self.argv);
    newPath = newPath || await inquirer.prompt([
      {
        type: 'input',
        name: 'path',
        default: 'service.key'
      }
    ]).then(answers => answers.path);

    let object = null;

    try {
      object = JSON5.parse(newPath);
    } catch (e) {
    }

    const isObject = object && typeof object === 'object';

    // If it's a string, ensure some things
    if (!isObject) {
      // Validate path
      if (!newPath.includes('.')) {
        console.log(chalk.red(`Path needs 2 parts (one.two): ${newPath}`));
        return reject();
      }

      // Make sure it's only letters, numbers, periods, and underscores
      if (newPath.match(/[^a-zA-Z0-9._]/)) {
        console.log(chalk.red(`Path contains invalid characters: ${newPath}`));
        return reject();
      }
    }

    try {
      if (isObject) {
        const keyify = (obj, prefix = '') =>
          Object.keys(obj).reduce((res, el) => {
            if( Array.isArray(obj[el]) ) {
              return res;
            } else if( typeof obj[el] === 'object' && obj[el] !== null ) {
              return [...res, ...keyify(obj[el], prefix + el + '.')];
            }
            return [...res, prefix + el];
          }, []);
        const pathArray = keyify(object);
        for (var i = 0; i < pathArray.length; i++) {
          const pathName = pathArray[i];
          const pathValue = _.get(object, pathName);
          // console.log(chalk.blue(`Setting object: ${chalk.bold(pathName)} = ${chalk.bold(pathValue)}`));
          console.log(chalk.blue(`Setting object: ${chalk.bold(pathName)}`));
          await cmd_configSet(self, pathName, pathValue)
          .catch(e => {
            log(chalk.red(`Failed to save object path: ${e}`));
          })
        }
        return resolve();
      }
    } catch (e) {
      log(chalk.red(`Failed to save object: ${e}`));
      return reject(e)
    }

    newValue = newValue || await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        default: '123-abc'
      }
    ]).then(answers => answers.value)

    let isInvalid = false;
    if (newPath !== newPath.toLowerCase()) {
      isInvalid = true;
      newPath = newPath.replace(/([A-Z])/g, '_$1').trim().toLowerCase();
    }

    log(chalk.yellow(`Saving to ${chalk.bold(newPath)}...`));

    await powertools.execute(`firebase functions:config:set ${newPath}="${newValue}"`, { log: true })
      .then((output) => {
        // Check if it was invalid
        if (isInvalid) {
          log(chalk.red(`!!! Your path contained an invalid uppercase character`));
          log(chalk.red(`!!! It was set to: ${chalk.bold(newPath)}`));
        } else {
          log(chalk.green(`Successfully saved to ${chalk.bold(newPath)}`));
        }

        // Resolve the promise
        resolve();
      })
      .catch((e) => {
        log(chalk.red(`Failed to save ${chalk.bold(newPath)}: ${e}`));

        // Reject the promise with the error
        reject(e);
      });
  });
}

async function cmd_configUnset(self) {
  return new Promise(async function(resolve, reject) {
    // console.log(self.options);
    // console.log(self.argv);
    await inquirer
      .prompt([
        /* Pass your questions in here */
        {
          type: 'input',
          name: 'path',
          default: 'service.key'
        }
      ])
      .then(async (answers) => {
        // Use user feedback for... whatever!!
        // console.log('answer', answers);
        log(chalk.yellow(`Deleting ${chalk.bold(answers.path)}...`));

        await powertools.execute(`firebase functions:config:unset ${answers.path}`, { log: true })
          .then((output) => {
            log(chalk.green(`Successfully deleted ${chalk.bold(answers.path)}`));

            // Resolve the promise
            resolve();
          })
          .catch((e) => {
            log(chalk.red(`Failed to delete ${chalk.bold(answers.path)}: ${e}`));

            // Reject the promise with the error
            reject(e);
          });
      });
  });
}

async function cmd_iamImportExport(self) {
  return new Promise(async function(resolve, reject) {
    const command = `
      gcloud projects add-iam-policy-binding {projectId} \
          --member serviceAccount:{projectId}@appspot.gserviceaccount.com \
          --role roles/datastore.importExportAdmin
    `
    .replace(/{projectId}/ig, self.projectId)

    await powertools.execute(command, { log: true })
      .then((output) => {
        // Resolve with the command's standard output
      })
      .catch((e) => {
        console.log(chalk.red(`Failed to run command`, e));

        // Reject with the error
        reject(e);
      });
  });
}

async function cmd_setStorageLifecycle(self) {
  return new Promise(async function(resolve, reject) {
    const command = `gsutil lifecycle set {config} gs://{bucket}`
      .replace(/{config}/ig, path.resolve(`${__dirname}/../../templates/storage-lifecycle-config-1-day.json`))
      .replace(/{bucket}/ig, `us.artifacts.${self.projectId}.appspot.com`)
    const command2 = `gsutil lifecycle set {config} gs://{bucket}`
      .replace(/{config}/ig, path.resolve(`${__dirname}/../../templates/storage-lifecycle-config-30-days.json`))
      .replace(/{bucket}/ig, `bm-backup-firestore-${self.projectId}`)

    await powertools.execute(command, { log: true })
      .then(() => {
        return powertools.execute(command2, { log: true });
      })
      .then((output) => {
        // Resolve with the output of the second command
        resolve(output.stdout);
      })
      .catch((e) => {
        console.log(chalk.red(`Failed to run command`, e));

        // Reject with the error
        reject(e);
      });
  });
}

// HELPER

function initMocha() {

}

function isLocal(name) {
  return name.indexOf('file:') > -1;
}

function installPkg(name, version, type) {
  let v;
  let t;
  if (name.indexOf('file:') > -1) {
    v = '';
  } else if (!version) {
    v = '@latest';
  } else {
    v = version;
  }

  if (!type) {
    t = ''
  } else if (type === 'dev' || type === '--save-dev') {
    t = ' --save-dev';
  }

  let latest = version ? '' : '@latest';
  return new Promise(async function(resolve, reject) {
    // Build the command
    const command = `npm i ${name}${v}${t}`;

    // Log
    console.log('Running ', command);

    // Execute
    await powertools.execute(command, { log: true })
      .then(() => {
        resolve();
      })
      .catch((e) => {
        reject(e);
      });
  });
}

function uninstallPkg(name) {
  return new Promise(async function(resolve, reject) {
    // Build the command
    const command = `npm uninstall ${name}`;

    // Log
    console.log('Running ', command);

    // Execute
    await powertools.execute(command, { log: true })
      .then(() => {
        resolve();
      })
      .catch((e) => {
        reject(e);
      });
  });
}
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

function cleanOutput(data) {
  try {
    data = (data + '').replace(/\n$/, '')
  } catch (e) {

  }

  // Return
  return data;
}
