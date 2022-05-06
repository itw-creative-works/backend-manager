// CLI GUIDE:
// https://www.twilio.com/blog/how-to-build-a-cli-with-node-js
// https://www.npmjs.com/package/@dkundel/create-project

// https://www.sitepoint.com/javascript-command-line-interface-cli-node-js/
// https://github.com/sitepoint-editors/ginit

let exec = require('child_process').exec;
const jetpack = require('fs-jetpack');
const path = require('path');
const chalk = require('chalk');
const _ = require('lodash');
const log = console.log;
let NpmApi = require('npm-api');
const semver = require('semver');
let inquirer = require('inquirer');
const { spawn } = require('child_process');
let argv = require('yargs').argv;
const JSON5 = require('json5');
const fetch = require('node-fetch');

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
let bem_fsRulesRegex = /(\/\/\/---backend-manager---\/\/\/)(.*?)(\/\/\/---------end---------\/\/\/)/sgm;
let bem_fsRulesDefaultRegex = /(\/\/\/---default-rules---\/\/\/)(.*?)(\/\/\/---------end---------\/\/\/)/sgm;
let bem_fsRulesBackupRegex = /({{\s*?backend-manager\s*?}})/sgm;
let MOCHA_PKG_SCRIPT = 'mocha ../test/ --recursive --timeout=10000';
let NPM_CLEAN_SCRIPT = 'rm -fr node_modules && rm -fr package-lock.json && npm cache clean --force && npm install && npm rb';
let NOFIX_TEXT = chalk.red(`There is no automatic fix for this check.`);
let runtimeconfigTemplate = JSON.parse((jetpack.read(path.resolve(`${__dirname}/../../templates/runtimeconfig.json`))) || '{}');
let bemConfigTemplate = JSON.parse((jetpack.read(path.resolve(`${__dirname}/../../templates/backend-manager-config.json`))) || '{}');
let CLI_CONFIG = JSON5.parse((jetpack.read(path.resolve(`${__dirname}/config.json`))) || '{}');

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
  if (self.options.cwd) {
    console.log('cwd: ', self.firebaseProjectPath);
  }
  if (self.options.setup) {
    await cmd_configGet(self).catch(e => log(chalk.red(`Failed to run config:get`)));
    await self.setup();
  }
  if ((self.options.i || self.options.install) && (self.options.local || self.options.dev || self.options.development)) {
    await uninstallPkg('backend-manager');
    return await installPkg('file:../../../ITW-Creative-Works/backend-manager');
    // await uninstallPkg('backend-assistant');
    // return await installPkg('file:../../backend-assistant');
  }
  if ((self.options.i || self.options.install) && (self.options.live || self.options.prod || self.options.production)) {
    await uninstallPkg('backend-manager');
    return await installPkg('backend-manager');
    // return await installPkg('backend-assistant');
  }
  if (self.options.serve) {
    if (!self.options.quick && !self.options.q) {
    }
    await cmd_configGet(self);
    await self.setup();

    let port = self.argv.port || _.get(self.argv, '_', [])[1] || '5000';
    let ls = spawn(`firebase serve --port ${port}`, {shell: true});

    ls.stdout.on('data', (data) => {
      console.log(`${cleanOutput(data)}`);
    });
    ls.stderr.on('data', (data) => {
      console.error(chalk.red(`${cleanOutput(data)}`));
      // ls = null;
    });
  }

  if (self.options['firestore:indexes:get'] || self.options['firestore:indexes'] || self.options['indexes:get']) {
    return await cmd_indexesGet(self, undefined, true);
  }

  if (self.options['functions:config:get'] || self.options['config:get']) {
    return await cmd_configGet(self);
  }

  if (self.options['functions:config:set'] || self.options['config:set']) {
    await cmd_configSet(self);
    return await cmd_configGet(self);
  }

  if (self.options['functions:config:unset'] || self.options['config:unset'] || self.options['config:delete'] || self.options['config:remove']) {
    await cmd_configUnset(self);
    return await cmd_configGet(self);
  }

  if (self.options['rules:default'] || self.options['rules:getdefault']) {
    self.getRulesFile();
    console.log(self.default.firestoreRulesWhole.match(bem_fsRulesDefaultRegex)[0].replace('    ///', '///'));
    return;
  }

  if (self.options.deploy) {
    await self.setup();

    // Quick check that not using local packages
    let deps = JSON.stringify(self.package.dependencies)
    let hasLocal = deps.includes('file:');
    if (hasLocal) {
      log(chalk.red(`Please remove local packages before deploying!`));
      return;
    }
    // let ls = spawn('firebase', ['deploy', '--only', 'functions']);
    // let ls = spawn('firebase', ['deploy', '--only', 'functions,firestore:rules']);
    let ls = spawn('firebase deploy --only functions,firestore:rules', {shell: true});
    ls.stdout.on('data', (data) => {
      // console.log(`${cleanOutput(data)}`);
      console.log(`${cleanOutput(data)}`);
    });
    ls.stderr.on('data', (data) => {
      console.error(chalk.red(`${cleanOutput(data)}`));
      // ls = null;
    });

  }
  if (self.options['test']) {
    await self.setup();
    // firebase emulators:exec --only firestore 'npm test'
    // let ls = spawn('firebase', ['emulators:exec', '--only', 'firestore', 'npm test']);
    // https://stackoverflow.com/questions/9722407/how-do-you-install-and-run-mocha-the-node-js-testing-module-getting-mocha-co
    let ls = spawn(`firebase emulators:exec --only firestore "npx ${MOCHA_PKG_SCRIPT}"`, {shell: true});
    ls.stdout.on('data', (data) => {
      console.log(`${cleanOutput(data)}`);
    });
    ls.stderr.on('data', (data) => {
      console.error(chalk.red(`${cleanOutput(data)}`));
    });
  }

  if (self.options['clean:npm']) {
    // await self.setup();
    // firebase emulators:exec --only firestore 'npm test'
    let ls = spawn(`${NPM_CLEAN_SCRIPT}`, {shell: true});
    ls.stdout.on('data', (data) => {
      console.log(`${cleanOutput(data)}`);
    });
    ls.stderr.on('data', (data) => {
      console.error(chalk.red(`${cleanOutput(data)}`));
    });
  }

  // if (self.options['url']) {
  //   // await self.setup();
  //   // firebase emulators:exec --only firestore 'npm test'
  //   log(self.projectUrl)
  // }

};

module.exports = Main;


Main.prototype.getRulesFile = function () {
  const self = this;
  self.default.firestoreRulesWhole = (jetpack.read(path.resolve(`${__dirname}/../../templates/firestore.rules`))).replace('=0.0.0-', `-${self.default.version}-`);
  self.default.firestoreRulesCore = self.default.firestoreRulesWhole.match(bem_fsRulesRegex)[0];

};

Main.prototype.setup = async function () {
  const self = this;
  let cwd = jetpack.cwd();
  log(chalk.green(`\n---- RUNNING SETUP v${self.default.version} ----`));
  self.package = jetpack.read(`${self.firebaseProjectPath}/functions/package.json`) || '{}';
  self.firebaseJSON = jetpack.read(`${self.firebaseProjectPath}/firebase.json`) || '{}';
  self.firebaseRC = jetpack.read(`${self.firebaseProjectPath}/.firebaserc`) || '{}';
  self.runtimeConfigJSON = jetpack.read(`${self.firebaseProjectPath}/functions/.runtimeconfig.json`) || '{}';
  self.remoteconfigJSON = jetpack.read(`${self.firebaseProjectPath}/remoteconfig.template.json`) || '{}';
  self.projectPackage = jetpack.read(`${self.firebaseProjectPath}/package.json`) || '{}';

  self.gitignore = jetpack.read(`${self.firebaseProjectPath}/functions/.gitignore`) || '';
  if (!self.package) {
    log(chalk.red(`Missing functions/package.json :(`));
    return;
  }
  // console.log('cwd', cwd, cwd.endsWith('functions'));
  if (!cwd.endsWith('functions') && !cwd.endsWith('functions/')) {
    log(chalk.red(`Please run ${chalk.bold('npx bm setup')} from the ${chalk.bold('functions')} folder. Run ${chalk.bold('cd functions')}.`));
    return;
  }

  self.package = JSON.parse(self.package);
  self.firebaseJSON = JSON.parse(self.firebaseJSON);
  self.firebaseRC = JSON.parse(self.firebaseRC);
  self.runtimeConfigJSON = JSON.parse(self.runtimeConfigJSON);
  self.remoteconfigJSON = JSON.parse(self.remoteconfigJSON);
  self.projectPackage = JSON.parse(self.projectPackage);

  self.remoteconfigJSONExists = Object.keys(self.remoteconfigJSON).length > 0;

  self.getRulesFile();

  self.default.firestoreRulesVersionRegex = new RegExp(`///---version-${self.default.version}---///`)
  // bem_giRegex = new RegExp(jetpack.read(path.resolve(`${__dirname}/../../templates/gitignore.md`)).replace(/\./g, '\\.'), 'm' )
  bem_giRegex = new RegExp(jetpack.read(path.resolve(`${__dirname}/../../templates/gitignore.md`)), 'm' )

  // tests
  self.projectName = self.firebaseRC.projects.default;
  self.projectUrl = `https://console.firebase.google.com/project/${self.projectName}`;
  log(chalk.black(`Id: `, chalk.bold(`${self.projectName}`)));
  log(chalk.black(`Url:`, chalk.bold(`${self.projectUrl}`)));

  if (!self.package || !self.package.engines || !self.package.engines.node) {
    throw new Error('Missing <engines.node> in package.json')
  }

  await self.test('is a firebase project', async function () {
    let exists = jetpack.exists(`${self.firebaseProjectPath}/firebase.json`);
    return exists;
  }, fix_isFirebase);

  await self.test('.nvmrc file has proper version', async function () {
    // return !!self.package.dependencies && !!self.package.devDependencies;
    // let gitignore = jetpack.read(path.resolve(`${__dirname}/../../templates/gitignore.md`));
    let nvmrc = jetpack.read(`${self.firebaseProjectPath}/functions/.nvmrc`) || '';
    return nvmrc === `v${CLI_CONFIG.node}/*`

  }, fix_nvmrc);

  await self.test(`using node ${CLI_CONFIG.node}`, function () {
    let processMajor = parseInt(process.versions.node.split('.')[0]);
    let engineMajor = parseInt(self.package.engines.node.split('.')[0]);
    if (processMajor < engineMajor) {
      return new Error(`Please use Node.js version ${CLI_CONFIG.node} with this project. You can run: nvm use`)
    }
    return self.package.engines.node.toString() === CLI_CONFIG.node && processMajor >= engineMajor;
  }, fix_nodeVersion);

  // await self.test('project level package.json exists', async function () {
  //   return !!(self.projectPackage && self.projectPackage.version && self.projectPackage.name);
  // }, fix_projpackage);

  await self.test('functions level package.json exists', async function () {
    return !!self.package && !!self.package.dependencies && !!self.package.devDependencies && !!self.package.version;
  }, fix_functionspackage);

  // await self.test('functions level package.json has updated version', async function () {
  //   return self.package.version === self.projectPackage.version;
  // }, fix_packageversion);

  await self.test('using updated firebase-admin', async function () {
    let pkg = 'firebase-admin';
    // let latest = semver.clean(await getPkgVersion(pkg));
    let latest = semver.clean(cleanPackageVersion(self.packageJSON.dependencies['firebase-admin']));
    let mine = cleanPackageVersion(self.package.dependencies[pkg] || '0.0.0');
    const majorVersionMismatch = ((semver.major(latest) > semver.major(mine)));
    let bemv = cleanPackageVersion(self.packageJSON.dependencies[pkg]);
    bemPackageVersionWarning(pkg, bemv, latest);

    if (majorVersionMismatch) {
      console.log(chalk.red(`Version ${chalk.bold(latest)} of ${chalk.bold(pkg)} available but you must install this manually because it is a major update.`));
    }

    return !(semver.gt(latest, mine)) || majorVersionMismatch;
  }, fix_fba);

  await self.test('using updated firebase-functions', async function () {
    let pkg = 'firebase-functions';
    // let latest = semver.clean(await getPkgVersion(pkg));
    let latest = semver.clean(cleanPackageVersion(self.packageJSON.dependencies['firebase-functions']));
    let mine = cleanPackageVersion(self.package.dependencies[pkg] || '0.0.0');
    const majorVersionMismatch = ((semver.major(latest) > semver.major(mine)));
    let bemv = cleanPackageVersion(self.packageJSON.dependencies[pkg]);
    bemPackageVersionWarning(pkg, bemv, latest);

    if (majorVersionMismatch) {
      console.log(chalk.red(`Version ${chalk.bold(latest)} of ${chalk.bold(pkg)} available but you must install this manually because it is a major update.`));
    }

    return !(semver.gt(latest, mine)) || majorVersionMismatch;
  }, fix_fbf);

  await self.test('using updated backend-manager', async function () {
    let pkg = 'backend-manager';
    let latest = semver.clean(await getPkgVersion(pkg));
    let mine = cleanPackageVersion(self.package.dependencies[pkg] || '0.0.0');
    const majorVersionMismatch = !isLocal(mine) && ((semver.major(latest) > semver.major(mine)));

    if (majorVersionMismatch) {
      console.log(chalk.red(`Version ${chalk.bold(latest)} of ${chalk.bold(pkg)} available but you must install this manually because it is a major update.`));
    }

    return isLocal(mine) || !(semver.gt(latest, mine)) || majorVersionMismatch;
  }, fix_bem);

  (async function() {
    let pkg = 'backend-assistant';
    let latest = semver.clean(await getPkgVersion(pkg));
    let bemv = cleanPackageVersion(self.packageJSON.dependencies[pkg]);
    bemPackageVersionWarning(pkg, bemv, latest);
  }());

  // await self.test('using updated backend-assistant', async function () {
  //   let pkg = 'backend-assistant';
  //   let latest = semver.clean(await getPkgVersion(pkg));
  //   let mine = (self.package.dependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
  //   return isLocal(mine) || !(semver.gt(latest, mine));
  // }, fix_bea);

  // await self.test('using updated ultimate-jekyll-poster', async function () {
  //   let pkg = 'ultimate-jekyll-poster';
  //   let latest = semver.clean(await getPkgVersion(pkg));
  //   let mine = (self.package.dependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
  //   return isLocal(mine) || !(semver.gt(latest, mine));
  // }, fix_ujp);

  // await self.test('using updated @firebase/testing', async function () {
  //   let pkg = '@firebase/testing';
  //   let latest = semver.clean(await getPkgVersion(pkg));
  //   let mine = (self.package.devDependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
  //   return isLocal(mine) || !(semver.gt(latest, mine));
  // }, fix_fbTesting);

  // await self.test('using updated mocha', async function () {
  //   let pkg = 'mocha';
  //   let latest = semver.clean(await getPkgVersion(pkg));
  //   let mine = (self.package.devDependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
  //   return isLocal(mine) || !(semver.gt(latest, mine));
  // }, fix_mocha);

  await self.test('using proper .runtimeconfig', async function () {
    let runtimeconfig = JSON.parse(jetpack.read(`${self.firebaseProjectPath}/functions/.runtimeconfig.json`) || '{}');
    let ogPaths = getObjectPaths(runtimeconfigTemplate).split('\n');
    let pass = true;
    for (var i = 0, l = ogPaths.length; i < l; i++) {
      let item = ogPaths[i];
      if (!item) {continue}
      pass = (_.get(runtimeconfig, item, undefined));
      if (typeof pass === 'undefined') {
        break;
      }
    }
    return !!pass;

  }, fix_runtimeConfig);

  await self.test('using proper backend-manager-config.json', async function () {
    let bemConfig = JSON.parse(jetpack.read(`${self.firebaseProjectPath}/functions/backend-manager-config.json`) || '{}');
    let ogPaths = getObjectPaths(bemConfigTemplate).split('\n');
    let pass = true;
    for (var i = 0, l = ogPaths.length; i < l; i++) {
      let item = ogPaths[i];
      if (!item) {continue}
      pass = (_.get(bemConfig, item, undefined));
      if (typeof pass === 'undefined' || typeof pass === '') {
        break;
      }
    }
    return !!pass;

  }, fix_bemConfig);

  await self.test('has service-account.json', function () {
    let exists = jetpack.exists(`${self.firebaseProjectPath}/functions/service-account.json`);
    return !!exists;
  }, fix_serviceAccount);

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


  // Check firebase.json fields
  await self.test('firestore rules in JSON', function () {
    const firestore = _.get(self.firebaseJSON, 'firestore', {});
    return (firestore.rules === 'firestore.rules')
  }, fix_firestoreRules);

  await self.test('firestore indexes in JSON', function () {
    let firestore = _.get(self.firebaseJSON, 'firestore', {});
    return (firestore.indexes === 'firestore.indexes.json')
  }, fix_firestoreIndexes);

  await self.test('realtime rules in JSON', function () {
    const database = _.get(self.firebaseJSON, 'database', {});
    return (database.rules === 'database.rules.json')
  }, fix_realtimeRules);

  await self.test('storage rules in JSON', function () {
    const storage = _.get(self.firebaseJSON, 'storage', {});
    return (storage.rules === 'storage.rules')
  }, fix_storageRules);

  await self.test('remoteconfig template in JSON', function () {
    const remoteconfig = _.get(self.firebaseJSON, 'remoteconfig', {});

    if (self.remoteconfigJSONExists) {
      return (remoteconfig.template === 'remoteconfig.template.json')
    } else {
      return (remoteconfig.template === '')
    }
  }, fix_remoteconfigTemplate);

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
  }, NOFIX);


  // Update actual files
  await self.test('update firestore rules file', function () {
    let exists = jetpack.exists(`${self.firebaseProjectPath}/firestore.rules`);
    let contents = jetpack.read(`${self.firebaseProjectPath}/firestore.rules`) || '';
    let containsCore = contents.match(bem_fsRulesRegex);
    let matchesVersion = contents.match(self.default.firestoreRulesVersionRegex);

    return (!!exists && !!containsCore && !!matchesVersion);
  }, fix_firestoreRulesFile);

  await self.test('update firestore indexes file', function () {
    let exists = jetpack.exists(`${self.firebaseProjectPath}/firestore.indexes.json`);
    return (!!exists);
  }, fix_firestoreIndexesFile);

  await self.test('update realtime rules file', function () {
    let exists = jetpack.exists(`${self.firebaseProjectPath}/database.rules.json`);
    return (!!exists);
  }, fix_realtimeRulesFile);

  await self.test('update storage rules file', function () {
    let exists = jetpack.exists(`${self.firebaseProjectPath}/storage.rules`);
    return (!!exists);
  }, fix_storageRulesFile);

  await self.test('update remoteconfig template file', function () {
    let exists = jetpack.exists(`${self.firebaseProjectPath}/remoteconfig.template.json`);
    return (!!exists);
  }, fix_remoteconfigTemplateFile);

  // Hosting
  await self.test('hosting is set to dedicated folder in JSON', function () {
    let hosting = _.get(self.firebaseJSON, 'hosting', {});
    return (hosting.public && (hosting.public === 'public' || hosting.public !== '.'))
  }, fix_firebaseHosting);

  await self.test('update backend-manager-tests.js', function () {
    jetpack.write(`${self.firebaseProjectPath}/test/backend-manager-tests.js`,
      (jetpack.read(path.resolve(`${__dirname}/../../templates/backend-manager-tests.js`)))
    )
    return true;
  }, NOFIX);

  // await self.test('has mocha package.json script', function () {
  //   let script = _.get(self.package, 'scripts.test', '')
  //   return script === MOCHA_PKG_SCRIPT;
  // }, fix_mochaScript);

  // await self.test('has clean:npm package.json script', function () {
  //   let script = _.get(self.package, 'scripts.clean:npm', '')
  //   return script === NPM_CLEAN_SCRIPT;
  // }, fix_cleanNpmScript);




  if (self.package.dependencies['backend-manager'].includes('file:')) {
    console.log('\n' + chalk.yellow(chalk.bold('Warning: ') + 'You are using the local ' + chalk.bold('backend-manager')));
  } else {
    console.log('\n');
  }


  const prepareStatsURL = `https://us-central1-${_.get(self.firebaseRC, 'projects.default')}.cloudfunctions.net/bm_api?authenticationToken=${_.get(self.runtimeConfigJSON, 'backend_manager.key')}`;
  // const prepareStatsURL = `https://us-central1-${_.get(self.firebaseRC, 'projects.default')}.cloudfunctions.net/bm_api?authenticationToken=undefined`;
  const statsFetchResult = await fetch(prepareStatsURL, {
    method: 'post',
    body: JSON.stringify({
      command: 'admin:get-stats',
    }),
    timeout: 3000,
  })
  .then(async (res) => {
    if (!res.ok) {
      return res.text()
        .then(data => {
          throw new Error(data || res.statusText || 'Unknown error.');
        })
        .catch(e => e)
    } else {
      return res.text()
      .then(data => {
        try {
          return JSON5.parse(data);
        } catch (e) {
          return e;
        }
      })
    }
  })
  .catch(e => e);

  if (statsFetchResult instanceof Error) {
    if (!statsFetchResult.message.includes('network timeout')) {
      console.log(chalk.yellow(`Ran into error while fetching stats endpoint`, statsFetchResult));
    }
  } else {
    // console.log(chalk.green(`Stats fetched/created properly.`, JSON.stringify(statsFetchResult)));
    console.log(chalk.green(`Stats fetched/created properly.`));
  }

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

// https://stackoverflow.com/questions/41802259/javascript-deep-check-objects-have-same-keys
// function objectsHaveSameKeys(...objects) {
//   let objectPaths = getObjectPaths()
//    // const allKeys = objects.reduce((keys, object) => keys.concat(Object.keys(object)), []);
//    // const union = new Set(allKeys);
//    // return objects.every(object => union.size === Object.keys(object).length);
//
//    // const allKeys = objects.reduce((keys, object) => keys.concat(Object.keys(object)), []);
//    console.log('allKeys', allKeys);
//    return false
// }

function getObjectPaths(object, parent) {
  let keys = Object.keys(object);
  let composite = '';
  parent = parent || '';
  for (var i = 0, l = keys.length; i < l; i++) {
    let item = object[keys[i]];
    composite += typeof item === 'object' ? getObjectPaths(item, keys[i]) : `${parent}.${keys[i]}\n`;
  }
  return composite;
}

Main.prototype.test = async function(name, fn, fix, args) {
  const self = this;
  let status;
  let passed = await fn();
  return new Promise(async function(resolve, reject) {
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
    log(chalk.black.bold(`[${self.testTotal}]`), chalk.black(`${name}:`), status);
    if (!passed) {
      log(chalk.yellow(`Fixing...`));
      fix(self, args)
      .then(function (result) {
        log(chalk.green(`...done~!`));
        resolve();
      })
    } else {
      resolve();
    }
  });
}

function cleanPackageVersion(v) {
  return v.replace('^', '').replace('~', '');
}

// FIXES
function NOFIX() {
  return new Promise(function(resolve, reject) {
    log(NOFIX_TEXT);
    reject();
  });
}

function bemPackageVersionWarning(package, current, latest) {
  if (semver.gt(latest, current)) {
    log(chalk.yellow(`${package} needs to be updated in backend-manager: ${current} => ${latest}`));
  }
}

async function fix_runtimeConfig(self) {
  return new Promise(function(resolve, reject) {
    log(NOFIX_TEXT);
    log(chalk.red(`You need to run ${chalk.bold(`npx bm config:set`)} for each of these keys:`));
    let objectKeys = getObjectPaths(runtimeconfigTemplate).split('\n');
    let theirConfig = JSON.parse(jetpack.read(`${self.firebaseProjectPath}/functions/.runtimeconfig.json`) || '{}');
    for (var i = 0, l = objectKeys.length; i < l; i++) {
      let item = objectKeys[i];
      if (!item) {return}
      let has = _.get(theirConfig, item, '');
      if (has) {
        log(chalk.red(`${item} (${has})`));
      } else {
        log(chalk.red.bold(`${item}`));
      }
    }
    // console.log('objectKeys', objectKeys);
    // log(chalk.red(`You need to run ${chalk.bold(`npx bm config:set`)} for each of these keys: \n${getObjectPaths(runtimeconfigTemplate)}`));
    reject();
  });
};

async function fix_bemConfig(self) {
  return new Promise(function(resolve, reject) {
    log(NOFIX_TEXT);
    log(chalk.red(`You need to open backend-manager-config.json and set each of these keys:`));
    let objectKeys = getObjectPaths(bemConfigTemplate).split('\n');
    let theirConfig = JSON.parse(jetpack.read(`${self.firebaseProjectPath}/functions/backend-manager-config.json`) || '{}');
    if (Object.keys(theirConfig).length < 1) {
      jetpack.write(`${self.firebaseProjectPath}/functions/backend-manager-config.json`, bemConfigTemplate)
    }
    for (var i = 0, l = objectKeys.length; i < l; i++) {
      let item = objectKeys[i];
      if (!item) {return}
      let has = _.get(theirConfig, item, '');
      if (has) {
        log(chalk.red(`${item} (${has})`));
      } else {
        log(chalk.red.bold(`${item}`));
      }
    }
    // console.log('objectKeys', objectKeys);
    // log(chalk.red(`You need to run ${chalk.bold(`bm config:set`)} for each of these keys: \n${getObjectPaths(runtimeconfigTemplate)}`));
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

function fix_nodeVersion(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.package, 'engines.node', CLI_CONFIG.node)

    jetpack.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2) );
    resolve();
  });
};

function fix_nvmrc(self) {
  return new Promise(function(resolve, reject) {

    jetpack.write(`${self.firebaseProjectPath}/functions/.nvmrc`, `v${CLI_CONFIG.node}/*`);
    resolve();
  });
};

async function fix_isFirebase(self) {
  log(chalk.red(`self is not a firebase project. Please use ${chalk.bold('firebase-init')} to set up.`));
  throw '';
  return;
};

function fix_projpackage(self) {
  return new Promise(function(resolve, reject) {
    self.projectPackage = self.projectPackage || {};
    self.projectPackage.name = self.projectPackage.name || self.projectName;
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
// async function fix_bea(self) {
//   return await installPkg('backend-assistant')
// };
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
    _.set(self.firebaseJSON, 'remoteconfig.template', self.remoteconfigJSONExists ? 'remoteconfig.template.json' : '')
    jetpack.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_firestoreRulesFile(self) {
  return new Promise(function(resolve, reject) {
    let path = `${self.firebaseProjectPath}/firestore.rules`;
    let exists = jetpack.exists(path);
    let contents = jetpack.read(path) || '';

    if (!exists || !contents) {
      log(chalk.yellow(`Writing new firestore.rules file...`));
      jetpack.write(path, self.default.firestoreRulesWhole)
      contents = jetpack.read(path) || '';
    }

    let hasTemplate = contents.match(bem_fsRulesRegex) || contents.match(bem_fsRulesBackupRegex);

    if (!hasTemplate) {
      log(chalk.red(`Could not find rules template. Please edit firestore.rules file and add`), chalk.red(`{{backend-manager}}`), chalk.red(`to it.`));
      reject()
    }

    let matchesVersion = contents.match(self.default.firestoreRulesVersionRegex);
    if (!matchesVersion) {
      // console.log('replace wih', self.default.firestoreRulesCore);
      contents = contents.replace(bem_fsRulesBackupRegex, self.default.firestoreRulesCore)
      contents = contents.replace(bem_fsRulesRegex, self.default.firestoreRulesCore)
      jetpack.write(path, contents)
      log(chalk.yellow(`Writing core rules to firestore.rules file...`));
    }
    resolve();
  });
};

function fix_firestoreIndexesFile(self) {
  return new Promise(async function(resolve, reject) {
    const name = 'firestore.indexes.json';
    let filePath = `${self.firebaseProjectPath}/${name}`;
    let exists = jetpack.exists(filePath);

    if (!exists) {
      log(chalk.yellow(`Writing new ${name} file...`));
      await cmd_indexesGet(self, name, false);
    }

    resolve();
  });
};

function fix_realtimeRulesFile(self) {
  return new Promise(function(resolve, reject) {
    const name = 'database.rules.json';
    let filePath = `${self.firebaseProjectPath}/${name}`;
    let exists = jetpack.exists(filePath);
    let contents = jetpack.read(filePath) || '';

    if (!exists) {
      log(chalk.yellow(`Writing new ${name} file...`));
      jetpack.write(filePath, jetpack.read(path.resolve(`${__dirname}/../../templates/${name}`)))
      contents = jetpack.read(filePath) || '';
    }

    resolve();
  });
};

function fix_storageRulesFile(self) {
  return new Promise(function(resolve, reject) {
    const name = 'storage.rules';
    let filePath = `${self.firebaseProjectPath}/${name}`;
    let exists = jetpack.exists(filePath);
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
    let filePath = `${self.firebaseProjectPath}/${name}`;
    let exists = jetpack.exists(filePath);
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
function fix_firebaseHosting(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.firebaseJSON, 'hosting.public', 'public')
    jetpack.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
    resolve();
  });
};

function getPkgVersion(package) {
  return new Promise(async function(resolve, reject) {
    let npm = new NpmApi();
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
  return new Promise(function(resolve, reject) {
    const finalPath = `${self.firebaseProjectPath}/${filePath || 'firestore.indexes.json'}`;
    let existingIndexes;
    try {
      existingIndexes = require(`${self.firebaseProjectPath}/firestore.indexes.json`)
    } catch (e) {
      if (log !== false) {
        console.error('Failed to read existing local indexes', e);
      }
    }
    let cmd = exec(`firebase firestore:indexes > ${finalPath}`, function (error, stdout, stderr) {
      if (error) {
        if (log !== false) {
          console.error(error);
        }
        reject(error);
      } else {
        const newIndexes = require(finalPath);
        if (log !== false) {
          console.log(chalk.green(`Saving indexes to: ${finalPath}`));
          console.log(stdout);

          const equal = (_.isEqual(newIndexes, existingIndexes));

          if (!equal) {
            console.log(chalk.red(`The live and local index files did not match and have been overwritten by the ${chalk.bold('live indexes')}`));
          }

        }
        resolve(newIndexes);
      }
    });
  });
}

async function cmd_configGet(self, filePath) {
  return new Promise(function(resolve, reject) {
    const finalPath = `${self.firebaseProjectPath}/${filePath || 'functions/.runtimeconfig.json'}`;
    let cmd = exec(`firebase functions:config:get > ${finalPath}`, function (error, stdout, stderr) {
      if (error) {
        console.error(error);
        reject(error);
      } else {
        console.log(chalk.green(`Saving config to: ${finalPath}`));
        console.log(stdout);
        resolve(require(finalPath));
      }
    });
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
    ]).then(answers => answers.path)

    try {
      const object = JSON5.parse(newPath)
      try {
        if (typeof object === 'object') {
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
    } catch (e) {
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
    let cmd = exec(`firebase functions:config:set ${newPath}="${newValue}"`, function (error, stdout, stderr) {
      if (error) {
        log(chalk.red(`Failed to save ${chalk.bold(newPath)}: ${error}`));
        reject(error);
      } else {
        console.log(stdout);
        if (isInvalid) {
          log(chalk.red(`!!! Your path contained an invalid uppercase character`));
          log(chalk.red(`!!! It was set to: ${chalk.bold(newPath)}`));
        } else {
          log(chalk.green(`Successfully saved to ${chalk.bold(newPath)}`));
        }
        resolve();
      }
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
      .then(answers => {
        // Use user feedback for... whatever!!
        // console.log('answer', answers);
        log(chalk.yellow(`Deleting ${chalk.bold(answers.path)}...`));
        let cmd = exec(`firebase functions:config:unset ${answers.path}`, function (error, stdout, stderr) {
          if (error) {
            log(chalk.red(`Failed to delete ${chalk.bold(answers.path)}: ${error}`));
            reject(error);
          } else {
            console.log(stdout);
            log(chalk.green(`Successfully deleted ${chalk.bold(answers.path)}`));
            resolve();
          }
        });
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
  return new Promise(function(resolve, reject) {
    let command = `npm i ${name}${v}${t}`;
    console.log('Running ', command);
    let cmd = exec(command, function (error, stdout, stderr) {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function uninstallPkg(name) {
  return new Promise(function(resolve, reject) {
    let command = `npm uninstall ${name}`;
    console.log('Running ', command);
    let cmd = exec(command, function (error, stdout, stderr) {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function cleanOutput(data) {
  try {
    // data = (data + '').replace('\n', '')
    data = (data + '').replace(/\n$/, '')
  } catch (e) {

  }
  return data;
  // try {
  //   data = data.replace(/\n/, '');
  // } catch (e) {
  //
  // } finally {
  //
  // }
  // return data;
  // // if (typeof data !== 'string') {
  // //   return data;
  // // } else {
  // //   return data.replace(/\n/, '');
  // // }
}
