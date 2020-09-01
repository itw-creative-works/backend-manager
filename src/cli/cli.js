// CLI GUIDE:
// https://www.twilio.com/blog/how-to-build-a-cli-with-node-js
// https://www.npmjs.com/package/@dkundel/create-project

// https://www.sitepoint.com/javascript-command-line-interface-cli-node-js/
// https://github.com/sitepoint-editors/ginit

let exec = require('child_process').exec;
const fs = require('fs-jetpack');
const path = require('path');
const chalk = require('chalk');
const _ = require('lodash');
const log = console.log;
let NpmApi = require('npm-api');
const semver = require('semver');
let inquirer = require('inquirer');
const { spawn } = require('child_process');
const clear = require('clear');
let argv = require('yargs').argv;
// const JSON5 = require('json5');

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
let runtimeconfigTemplate = JSON.parse((fs.read(path.resolve(`${__dirname}/../../templates/runtimeconfig.json`))) || '{}');



function Main() {
}

Main.prototype.process = async function (args) {
  let self = this;
  this.options = {};
  this.argv = argv;
  this.firebaseProjectPath = process.cwd();
  this.firebaseProjectPath = this.firebaseProjectPath.match(/\/functions$/) ? this.firebaseProjectPath.replace(/\/functions$/, '') : this.firebaseProjectPath;
  this.testCount = 0;
  this.testTotal = 0;
  this.default = {};
  this.packageJSON = require('../../package.json');
  this.default.version = this.packageJSON.version;

  for (var i = 0; i < args.length; i++) {
    this.options[args[i]] = true;
  }
  // console.log(args);
  // console.log(options);
  if (this.options.v || this.options.version || this.options['-v'] || this.options['-version']) {
    console.log(`Backend manager is version: ${this.default.version}`);
  }
  if (this.options.clear) {
    clear();
  }
  if (this.options.cwd) {
    console.log('cwd: ', this.firebaseProjectPath);
  }
  if (this.options.setup) {
    await self.setup();
  }
  if ((this.options.i || this.options.install) && (this.options.local || this.options.dev || this.options.development)) {
    await uninstallPkg('backend-manager');
    return await installPkg('file:../../../ITW-Creative-Works/backend-manager');
    // await uninstallPkg('backend-assistant');
    // return await installPkg('file:../../backend-assistant');
  }
  if ((this.options.i || this.options.install) && (this.options.live || this.options.prod || this.options.production)) {
    await uninstallPkg('backend-manager');
    return await installPkg('backend-manager');
    // return await installPkg('backend-assistant');
  }
  if (this.options.serve) {
    if (!this.options.quick && !this.options.q) {
    }
    await cmd_configGet(self);
    await self.setup();

    let port = this.argv.port || _.get(self.argv, '_', [])[1] || '5000';
    let ls = spawn(`firebase serve --port ${port}`, {shell: true});

    ls.stdout.on('data', (data) => {
      console.log(`${cleanOutput(data)}`);
    });
    ls.stderr.on('data', (data) => {
      console.error(chalk.red(`${cleanOutput(data)}`));
      // ls = null;
    });
  }
  if (this.options['config:get']) {
    return await cmd_configGet(self);
  }

  if (this.options['config:set']) {
    await cmd_configSet(self);
    return await cmd_configGet(self);
  }

  if (this.options['config:unset'] || this.options['config:delete']) {
    await cmd_configUnset(self);
    return await cmd_configGet(self);
  }

  if (this.options['rules:default'] || this.options['rules:getdefault']) {
    self.getRulesFile();
    console.log(self.default.firestoreRulesWhole.match(bem_fsRulesDefaultRegex)[0].replace('    ///', '///'));
    return;
  }

  if (this.options.deploy) {
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
  if (this.options['test']) {
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

  if (this.options['clean:npm']) {
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

  // if (this.options['url']) {
  //   // await self.setup();
  //   // firebase emulators:exec --only firestore 'npm test'
  //   log(this.projectUrl)
  // }

};

module.exports = Main;


Main.prototype.getRulesFile = function () {
  let self = this;
  this.default.firestoreRulesWhole = (fs.read(path.resolve(`${__dirname}/../../templates/firestore.rules`))).replace('=0.0.0-', `-${self.default.version}-`);
  this.default.firestoreRulesCore = this.default.firestoreRulesWhole.match(bem_fsRulesRegex)[0];

};

Main.prototype.setup = async function () {
  let self = this;
  let cwd = fs.cwd();
  log(chalk.green(`\n---- RUNNING SETUP ----`));
  this.package = fs.read(`${this.firebaseProjectPath}/functions/package.json`) || '{}';
  this.firebaseJSON = fs.read(`${this.firebaseProjectPath}/firebase.json`) || '{}';
  this.firebaseRC = fs.read(`${this.firebaseProjectPath}/.firebaserc`) || '{}';
  this.projectPackage = fs.read(`${this.firebaseProjectPath}/package.json`) || '{}';
  this.gitignore = fs.read(`${this.firebaseProjectPath}/functions/.gitignore`) || '';
  if (!this.package) {
    log(chalk.red(`Missing functions/package.json :(`));
    return;
  }
  // console.log('cwd', cwd, cwd.endsWith('functions'));
  if (!cwd.endsWith('functions') && !cwd.endsWith('functions/')) {
    log(chalk.red(`Please run ${chalk.bold('bm setup')} from the ${chalk.bold('functions')} folder. Run ${chalk.bold('cd functions')}.`));
    return;
  }

  this.package = JSON.parse(this.package);
  this.firebaseJSON = JSON.parse(this.firebaseJSON);
  this.firebaseRC = JSON.parse(this.firebaseRC);
  this.projectPackage = JSON.parse(this.projectPackage);

  self.getRulesFile();

  this.default.firestoreRulesVersionRegex = new RegExp(`///---version-${self.default.version}---///`)
  // bem_giRegex = new RegExp(fs.read(path.resolve(`${__dirname}/../../templates/gitignore.md`)).replace(/\./g, '\\.'), 'm' )
  bem_giRegex = new RegExp(fs.read(path.resolve(`${__dirname}/../../templates/gitignore.md`)), 'm' )

  // tests
  this.projectName = this.firebaseRC.projects.default;
  this.projectUrl = `https://console.firebase.google.com/project/${this.projectName}`;
  log(chalk.black(`Id: `, chalk.bold(`${this.projectName}`)));
  log(chalk.black(`Url:`, chalk.bold(`${this.projectUrl}`)));
  await this.test('is a firebase project', async function () {
    let exists = fs.exists(`${self.firebaseProjectPath}/firebase.json`);
    return exists;
  }, fix_isFirebase);

  await this.test('project level package.json exists', async function () {
    return !!(self.projectPackage && self.projectPackage.version && self.projectPackage.name);
  }, fix_projpackage);

  await this.test('functions level package.json exists', async function () {
    return !!self.package.dependencies && !!self.package.devDependencies;
  }, fix_deps);

  await this.test('functions level package.json has updated version', async function () {
    return self.package.version === self.projectPackage.version;
  }, fix_packageversion);

  await this.test('using updated firebase-admin', async function () {
    let pkg = 'firebase-admin';
    // let latest = semver.clean(await getPkgVersion(pkg));
    let latest = semver.clean(cleanPackageVersion(self.packageJSON.dependencies['firebase-admin']));
    let mine = cleanPackageVersion(self.package.dependencies[pkg] || '0.0.0');

    let bemv = cleanPackageVersion(self.packageJSON.dependencies[pkg]);
    bemPackageVersionWarning(pkg, bemv, latest);

    return !(semver.gt(latest, mine));
  }, fix_fba);

  await this.test('using updated firebase-functions', async function () {
    let pkg = 'firebase-functions';
    // let latest = semver.clean(await getPkgVersion(pkg));
    let latest = semver.clean(cleanPackageVersion(self.packageJSON.dependencies['firebase-functions']));
    let mine = cleanPackageVersion(self.package.dependencies[pkg] || '0.0.0');

    let bemv = cleanPackageVersion(self.packageJSON.dependencies[pkg]);
    bemPackageVersionWarning(pkg, bemv, latest);

    return !(semver.gt(latest, mine));
  }, fix_fbf);

  await this.test('using updated backend-manager', async function () {
    let pkg = 'backend-manager';
    let latest = semver.clean(await getPkgVersion(pkg));
    let mine = cleanPackageVersion(self.package.dependencies[pkg] || '0.0.0');

    return isLocal(mine) || !(semver.gt(latest, mine));
  }, fix_bem);

  (async function() {
    let pkg = 'backend-assistant';
    let latest = semver.clean(await getPkgVersion(pkg));
    let bemv = cleanPackageVersion(self.packageJSON.dependencies[pkg]);
    bemPackageVersionWarning(pkg, bemv, latest);
  }());

  // await this.test('using updated backend-assistant', async function () {
  //   let pkg = 'backend-assistant';
  //   let latest = semver.clean(await getPkgVersion(pkg));
  //   let mine = (self.package.dependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
  //   return isLocal(mine) || !(semver.gt(latest, mine));
  // }, fix_bea);

  // await this.test('using updated ultimate-jekyll-poster', async function () {
  //   let pkg = 'ultimate-jekyll-poster';
  //   let latest = semver.clean(await getPkgVersion(pkg));
  //   let mine = (self.package.dependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
  //   return isLocal(mine) || !(semver.gt(latest, mine));
  // }, fix_ujp);

  // await this.test('using updated @firebase/testing', async function () {
  //   let pkg = '@firebase/testing';
  //   let latest = semver.clean(await getPkgVersion(pkg));
  //   let mine = (self.package.devDependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
  //   return isLocal(mine) || !(semver.gt(latest, mine));
  // }, fix_fbTesting);

  // await this.test('using updated mocha', async function () {
  //   let pkg = 'mocha';
  //   let latest = semver.clean(await getPkgVersion(pkg));
  //   let mine = (self.package.devDependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
  //   return isLocal(mine) || !(semver.gt(latest, mine));
  // }, fix_mocha);

  await this.test('using proper .runtimeconfig', async function () {
    let runtimeconfig = JSON.parse(fs.read(`${self.firebaseProjectPath}/functions/.runtimeconfig.json`) || '{}');
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

  await this.test('using node 12', function () {
    return self.package.engines.node.toString() === '12';
  }, fix_nodeVersion);

  await this.test('has service-account.json', function () {
    let exists = fs.exists(`${self.firebaseProjectPath}/functions/service-account.json`);
    return !!exists;
  }, fix_serviceAccount);

  await this.test('has correct .gitignore', function () {
    let match = self.gitignore.match(bem_giRegexOuter);
    if (!match) {
      return false;
    } else {
      let gitignore = fs.read(path.resolve(`${__dirname}/../../templates/gitignore.md`));
      let file = gitignore.match(bem_giRegexOuter) ? RegExp.$1 : 'BAD1';
      let file2 = match[0].match(bem_giRegexOuter) ? RegExp.$1 : 'BAD2';
      return file === file2;
    }
  }, fix_gitignore);

  await this.test('firestore rules in JSON', function () {
    let firestore = _.get(self.firebaseJSON, 'firestore', {});
    return (firestore.rules === 'firestore.rules')
  }, fix_firestoreRules);

  await this.test('realtime rules in JSON', function () {
    let firestore = _.get(self.firebaseJSON, 'database', {});
    return (firestore.rules === 'security.rules.json')
  }, fix_realtimeRules);

  await this.test('hosting is set to dedicated folder in JSON', function () {
    let hosting = _.get(self.firebaseJSON, 'hosting', {});
    return (hosting.public && (hosting.public === 'public' || hosting.public !== '.'))
  }, fix_firebaseHosting);

  await this.test('update backend-manager-tests.js', function () {
    fs.write(`${self.firebaseProjectPath}/test/backend-manager-tests.js`,
      (fs.read(path.resolve(`${__dirname}/../../templates/backend-manager-tests.js`)))
    )
    return true;
  }, NOFIX);

  // await this.test('has mocha package.json script', function () {
  //   let script = _.get(self.package, 'scripts.test', '')
  //   return script === MOCHA_PKG_SCRIPT;
  // }, fix_mochaScript);

  // await this.test('has clean:npm package.json script', function () {
  //   let script = _.get(self.package, 'scripts.clean:npm', '')
  //   return script === NPM_CLEAN_SCRIPT;
  // }, fix_cleanNpmScript);

  await this.test('ignore firestore indexes file', function () {
    let firestore = _.get(self.firebaseJSON, 'firestore', {});
    return (firestore.indexes === '')
  }, fix_firebaseIndexes);

  await this.test('update firestore rules file', function () {
    let exists = fs.exists(`${self.firebaseProjectPath}/firestore.rules`);
    let contents = fs.read(`${self.firebaseProjectPath}/firestore.rules`) || '';
    let containsCore = contents.match(bem_fsRulesRegex);
    let matchesVersion = contents.match(self.default.firestoreRulesVersionRegex);

    // console.log('exists', !!exists);
    // console.log('containsCore', !!containsCore);
    // console.log('matchesVersion', !!matchesVersion);
    return (!!exists && !!containsCore && !!matchesVersion);
  }, fix_firestoreRulesFile);

  await this.test('update realtime rules file', function () {
    let exists = fs.exists(`${self.firebaseProjectPath}/security.rules.json`);
    return (!!exists);
  }, fix_realtimeRulesFile);


  if (self.package.dependencies['backend-manager'].includes('file:')) {
    console.log('\n' + chalk.yellow(chalk.bold('Warning: ') + 'You are using the local ' + chalk.bold('backend-manager')));
  } else {
    console.log('\n');
  }

  console.log(chalk.green(`Checks finished. Passed ${self.testCount}/${self.testTotal} tests.`));
  if (self.testCount !== self.testTotal) {
    console.log(chalk.yellow(`You should continue to run ${chalk.bold('bm setup')} until you pass all tests and fix all errors.`));
  }

  return;

  // await this.test('deleted firestore indexes', function () {
  //   let indexes = fs.exists(`${self.firebaseProjectPath}/firestore.indexes.json`);
  //   return (!indexes);
  // }, fix_fsindexes);

  // console.log(self.package);

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
  let self = this;
  let status;
  let passed = await fn();
  return new Promise(async function(resolve, reject) {
    if (passed) {
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
    log(chalk.red(`You need to run ${chalk.bold(`bm config:set`)} for each of these keys:`));
    let objectKeys = getObjectPaths(runtimeconfigTemplate).split('\n');
    let theirConfig = JSON.parse(fs.read(`${self.firebaseProjectPath}/functions/.runtimeconfig.json`) || '{}');
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
//     fs.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2) );
//     resolve();
//   });
// }

function fix_nodeVersion(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.package, 'engines.node', '12')

    fs.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2) );
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

    fs.write(`${self.firebaseProjectPath}/package.json`, JSON.stringify(self.projectPackage, null, 2) );
    resolve();
  });
};

function fix_deps(self) {
  return new Promise(function(resolve, reject) {
    self.package.dependencies = self.package.dependencies || {};
    self.package.devDependencies = self.package.devDependencies || {};

    fs.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2) );
    resolve();
  });
};

function fix_packageversion(self) {
  return new Promise(function(resolve, reject) {
    self.package.version = self.projectPackage.version;

    fs.write(`${self.firebaseProjectPath}/functions/package.json`, JSON.stringify(self.package, null, 2) );
    resolve();
  });
};

async function fix_fbf(self) {
  return await installPkg('firebase-functions', `@${self.packageJSON.dependencies['firebase-functions']}`)
};
async function fix_fba(self) {
  return await installPkg('firebase-admin', `@${self.packageJSON.dependencies['firebase-admin']}`)
};
async function fix_bem(self) {
  return await installPkg('backend-manager')
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
    let gi = (fs.read(path.resolve(`${__dirname}/../../templates/gitignore.md`)));
    if (self.gitignore.match(bem_giRegexOuter)) {
      self.gitignore = self.gitignore.replace(bem_giRegexOuter, gi);
    } else {
      self.gitignore = gi;
    }
    self.gitignore = self.gitignore.replace(/\n\s*\n$/mg, '\n')
    // self.gitignore = `${self.gitignore}\n${gi}`.replace(/$\n/m,'');
    // self.gitignore = self.gitignore.replace(/$\n/m,'');
    fs.write(`${self.firebaseProjectPath}/functions/.gitignore`, self.gitignore);
    resolve();
  });
};

function fix_firestoreRules(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.firebaseJSON, 'firestore.rules', 'firestore.rules')
    fs.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_realtimeRules(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.firebaseJSON, 'database.rules', 'security.rules.json')
    fs.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_firebaseHosting(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.firebaseJSON, 'hosting.public', 'public')
    fs.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_firebaseIndexes(self) {
  return new Promise(function(resolve, reject) {
    _.set(self.firebaseJSON, 'firestore.indexes', "")
    fs.write(`${self.firebaseProjectPath}/firebase.json`, JSON.stringify(self.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_firestoreRulesFile(self) {
  return new Promise(function(resolve, reject) {
    let path = `${self.firebaseProjectPath}/firestore.rules`;
    let exists = fs.exists(path);
    let contents = fs.read(path) || '';

    if (!exists || !contents) {
      log(chalk.yellow(`Writing new firestore.rules file...`));
      fs.write(path, self.default.firestoreRulesWhole)
      contents = fs.read(path) || '';
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
      fs.write(path, contents)
      log(chalk.yellow(`Writing core rules to firestore.rules file...`));
    }
    resolve();
  });
};

function fix_realtimeRulesFile(self) {
  return new Promise(function(resolve, reject) {
    let filePath = `${self.firebaseProjectPath}/security.rules.json`;
    let exists = fs.exists(filePath);
    let contents = fs.read(filePath) || '';

    if (!exists) {
      log(chalk.yellow(`Writing new security.rules.json file...`));
      fs.write(filePath, fs.read(path.resolve(`${__dirname}/../../templates/security.rules.json`)))
      contents = fs.read(filePath) || '';
    }

    resolve();
  });
};

function fix_fsindexes(self) {
  return new Promise(function(resolve, reject) {
    fs.remove(`${self.firebaseProjectPath}/firestore.indexes.json`)
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



  async function cmd_configGet(self) {
    return new Promise(function(resolve, reject) {
      let cmd = exec(`firebase functions:config:get > ${self.firebaseProjectPath}/functions/.runtimeconfig.json`, function (error, stdout, stderr) {
        if (error) {
          console.error(error);
          reject(error);
        } else {
          console.log(`Saving config to: ${self.firebaseProjectPath}/functions/.runtimeconfig.json`);
          console.log(stdout);
          resolve();
        }
      });
    });
  }

  async function cmd_configSet(self) {
    return new Promise(async function(resolve, reject) {
      // console.log(this.options);
      // console.log(this.argv);
      await inquirer
        .prompt([
          /* Pass your questions in here */
          {
            type: 'input',
            name: 'path',
            default: 'service.key'
          },
          {
            type: 'input',
            name: 'value',
            default: '123-abc'
          }
        ])
        .then(answers => {
          // Use user feedback for... whatever!!
          // console.log('answer', answers);
          log(chalk.yellow(`Saving...`));
          let cmd = exec(`firebase functions:config:set ${answers.path}="${answers.value}"`, function (error, stdout, stderr) {
            if (error) {
              console.error(error);
              reject();
            } else {
              console.log(stdout);
              resolve();
            }
          });
        });
    });
  }

  async function cmd_configUnset(self) {
    return new Promise(async function(resolve, reject) {
      // console.log(this.options);
      // console.log(this.argv);
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
          log(chalk.yellow(`Saving...`));
          let cmd = exec(`firebase functions:config:unset ${answers.path}`, function (error, stdout, stderr) {
            if (error) {
              console.error(error);
              reject();
            } else {
              console.log(stdout);
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
