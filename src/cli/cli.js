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
const semver = require("semver");
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
  let This = this;
  this.options = {};
  this.argv = argv;
  this.firebaseProjectPath = process.cwd();
  this.firebaseProjectPath = this.firebaseProjectPath.match(/\/functions$/) ? this.firebaseProjectPath.replace(/\/functions$/, '') : this.firebaseProjectPath;
  this.testCount = 0;
  this.testTotal = 0;
  this.default = {};
  this.default.version = `${require('../../package.json').version}`;

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
    await This.setup();
  }
  if ((this.options.i || this.options.install) && (this.options.local || this.options.dev || this.options.development)) {
    await uninstallPkg('backend-manager');
    return await installPkg('file:../../backend-manager');
    // await uninstallPkg('backend-assistant');
    // return await installPkg('file:../../backend-assistant');
  }
  if ((this.options.i || this.options.install) && (this.options.live || this.options.prod || this.options.production)) {
    await installPkg('backend-manager');
    return await installPkg('backend-assistant');
  }
  if (this.options.serve) {
    if (!this.options.quick && !this.options.q) {
    }
    await cmd_configGet(This);
    await This.setup();

    let port = this.argv.port || _.get(This.argv, '_', [])[1] || '5000';
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
    return await cmd_configGet(This);
  }

  if (this.options['config:set']) {
    await cmd_configSet(This);
    return await cmd_configGet(This);
  }

  if (this.options['config:unset'] || this.options['config:delete']) {
    await cmd_configUnset(This);
    return await cmd_configGet(This);
  }

  if (this.options['rules:default'] || this.options['rules:getdefault']) {
    This.getRulesFile();
    console.log(This.default.firestoreRulesWhole.match(bem_fsRulesDefaultRegex)[0].replace('    ///', '///'));
    return;
  }

  if (this.options.deploy) {
    await This.setup();

    // Quick check that not using local packages
    let deps = JSON.stringify(This.package.dependencies)
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
    await This.setup();
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
    // await This.setup();
    // firebase emulators:exec --only firestore 'npm test'
    let ls = spawn(`${NPM_CLEAN_SCRIPT}`, {shell: true});
    ls.stdout.on('data', (data) => {
      console.log(`${cleanOutput(data)}`);
    });
    ls.stderr.on('data', (data) => {
      console.error(chalk.red(`${cleanOutput(data)}`));
    });
  }

};

module.exports = Main;


Main.prototype.getRulesFile = function () {
  let This = this;
  this.default.firestoreRulesWhole = (fs.read(path.resolve(`${__dirname}/../../templates/firestore.rules`))).replace('=0.0.0-', `-${This.default.version}-`);
  this.default.firestoreRulesCore = this.default.firestoreRulesWhole.match(bem_fsRulesRegex)[0];

};

Main.prototype.setup = async function () {
  let This = this;
  let cwd = fs.cwd();
  log(chalk.green(`\n---- RUNNING SETUP ----`));
  this.package = fs.read(`${this.firebaseProjectPath}/functions/package.json`);
  this.gitignore = fs.read(`${this.firebaseProjectPath}/functions/.gitignore`);
  this.firebaseJSON = fs.read(`${this.firebaseProjectPath}/firebase.json`);
  this.firebaseRC = fs.read(`${this.firebaseProjectPath}/.firebaserc`);
  if (!this.package) {
    log(chalk.red(`Missing package.json :(`));
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

  This.getRulesFile();

  this.default.firestoreRulesVersionRegex = new RegExp(`///---version-${This.default.version}---///`)
  // bem_giRegex = new RegExp(fs.read(path.resolve(`${__dirname}/../../templates/gitignore.md`)).replace(/\./g, '\\.'), 'm' )
  bem_giRegex = new RegExp(fs.read(path.resolve(`${__dirname}/../../templates/gitignore.md`)), 'm' )
  // tests
  // await this.test('using updates backend-manager-clie', function () {
  //   return This.package.engines.node.toString() == '10';
  // }, fix_node10);
  this.projectName = this.firebaseRC.projects.default;
  log(chalk.black(`For Firebase project:`, chalk.bold(`${this.projectName}`)));
  await this.test('is a firebase project', async function () {
    let exists = fs.exists(`${This.firebaseProjectPath}/firebase.json`);
    return exists;
  }, fix_isFirebase);

  await this.test('package.json has dependencies field', async function () {
    return !!This.package.dependencies && !!This.package.devDependencies;
  }, fix_deps);

  await this.test('using updated firebase-admin', async function () {
    let pkg = 'firebase-admin';
    let latest = semver.clean(await getPkgVersion(pkg));
    let mine = (This.package.dependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
    return !(semver.gt(latest, mine));
  }, fix_fba);

  await this.test('using updated firebase-functions', async function () {
    let pkg = 'firebase-functions';
    let latest = semver.clean(await getPkgVersion(pkg));
    let mine = (This.package.dependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
    return !(semver.gt(latest, mine));
  }, fix_fbf);

  await this.test('using updated backend-manager', async function () {
    let pkg = 'backend-manager';
    let latest = semver.clean(await getPkgVersion(pkg));
    let mine = (This.package.dependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
    return isLocal(mine) || !(semver.gt(latest, mine));
  }, fix_bem);

  // await this.test('using updated backend-assistant', async function () {
  //   let pkg = 'backend-assistant';
  //   let latest = semver.clean(await getPkgVersion(pkg));
  //   let mine = (This.package.dependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
  //   return isLocal(mine) || !(semver.gt(latest, mine));
  // }, fix_bea);

  // await this.test('using updated ultimate-jekyll-poster', async function () {
  //   let pkg = 'ultimate-jekyll-poster';
  //   let latest = semver.clean(await getPkgVersion(pkg));
  //   let mine = (This.package.dependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
  //   return isLocal(mine) || !(semver.gt(latest, mine));
  // }, fix_ujp);

  await this.test('using updated @firebase/testing', async function () {
    let pkg = '@firebase/testing';
    let latest = semver.clean(await getPkgVersion(pkg));
    let mine = (This.package.devDependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
    return isLocal(mine) || !(semver.gt(latest, mine));
  }, fix_fbTesting);

  await this.test('using updated mocha', async function () {
    let pkg = 'mocha';
    let latest = semver.clean(await getPkgVersion(pkg));
    let mine = (This.package.devDependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
    return isLocal(mine) || !(semver.gt(latest, mine));
  }, fix_mocha);

  await this.test('using proper .runtimeconfig', async function () {
    let runtimeconfig = JSON.parse(fs.read(`${This.firebaseProjectPath}/functions/.runtimeconfig.json`) || '{}');
    // console.log('runtimeconfig', runtimeconfig, runtimeconfig.mailchimp);
    return objectsHaveSameKeys(runtimeconfig, runtimeconfigTemplate)

  }, fix_runtimeConfig);

  await this.test('using node 10', function () {
    return This.package.engines.node.toString() == '10';
  }, fix_node10);

  await this.test('has service-account.json', function () {
    let exists = fs.exists(`${This.firebaseProjectPath}/functions/service-account.json`);
    return !!exists;
  }, fix_serviceAccount);

  await this.test('has correct .gitignore', function () {
    return !!This.gitignore.match(bem_giRegex);
  }, fix_gitignore);

  await this.test('firebase rules in JSON', function () {
    let firestore = _.get(This.firebaseJSON, 'firestore', {});
    return (firestore.rules == 'firestore.rules')
  }, fix_firebaseRules);

  await this.test('update backend-manager-tests.js', function () {
    fs.write(`${This.firebaseProjectPath}/test/backend-manager-tests.js`,
      (fs.read(path.resolve(`${__dirname}/../../templates/backend-manager-tests.js`)))
    )
    return true;
  }, NOFIX);

  // await this.test('has mocha package.json script', function () {
  //   let script = _.get(This.package, 'scripts.test', '')
  //   return script == MOCHA_PKG_SCRIPT;
  // }, fix_mochaScript);

  // await this.test('has clean:npm package.json script', function () {
  //   let script = _.get(This.package, 'scripts.clean:npm', '')
  //   return script == NPM_CLEAN_SCRIPT;
  // }, fix_cleanNpmScript);

  await this.test('ignore firestore indexes file', function () {
    let firestore = _.get(This.firebaseJSON, 'firestore', {});
    return (firestore.indexes == '')
  }, fix_firebaseIndexes);

  await this.test('update firestore rules file', function () {
    let exists = fs.exists(`${This.firebaseProjectPath}/firestore.rules`);
    let contents = fs.read(`${This.firebaseProjectPath}/firestore.rules`) || '';
    let containsCore = contents.match(bem_fsRulesRegex);
    let matchesVersion = contents.match(This.default.firestoreRulesVersionRegex);

    // console.log('exists', !!exists);
    // console.log('containsCore', !!containsCore);
    // console.log('matchesVersion', !!matchesVersion);
    return (!!exists && !!containsCore && !!matchesVersion);
  }, fix_fsrules);


  console.log('\n');
  console.log(chalk.green(`Checks finished. Passed ${This.testCount}/${This.testTotal} tests.`));
  if (This.testCount !== This.testTotal) {
    console.log(chalk.yellow(`You should continue to run ${chalk.bold('bm setup')} until you pass all tests and fix all errors.`));
  }

  return;

  await this.test('deleted firestore indexes', function () {
    let indexes = fs.exists(`${This.firebaseProjectPath}/firestore.indexes.json`);
    return (!indexes);
  }, fix_fsindexes);

  // console.log(This.package);

};

function objectsHaveSameKeys(...objects) {
   const allKeys = objects.reduce((keys, object) => keys.concat(Object.keys(object)), []);
   const union = new Set(allKeys);
   return objects.every(object => union.size === Object.keys(object).length);
}

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
  let This = this;
  let status;
  let passed = await fn();
  return new Promise(async function(resolve, reject) {
    if (passed) {
      status = chalk.green('passed');
      This.testCount++;
      This.testTotal++;
    } else {
      status = chalk.red('failed');
      This.testTotal++;
    }
    log(chalk.black.bold(`[${This.testTotal}]`), chalk.black(`${name}:`), status);
    if (!passed) {
      log(chalk.yellow(`Fixing...`));
      fix(This, args)
      .then(function (result) {
        log(chalk.green(`...done~!`));
        resolve();
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

async function fix_runtimeConfig(This) {
  return new Promise(function(resolve, reject) {
    log(NOFIX_TEXT);
    log(chalk.red(`You need to run ${chalk.bold(`bm config:set`)} for each of these keys: \n${getObjectPaths(runtimeconfigTemplate)}`));
    reject();
  });
};

async function fix_serviceAccount(This) {
  return new Promise(function(resolve, reject) {
    log(NOFIX_TEXT);
    log(chalk.red(`Please install a service account --> ` + chalk.yellow.bold(`https://console.firebase.google.com/project/${This.projectName}/settings/serviceaccounts/adminsdk`)));
    reject();
  });
};

// function fix_mochaScript(This) {
//   return new Promise(function(resolve, reject) {
//     _.set(This.package, 'scripts.test', MOCHA_PKG_SCRIPT);
//     fs.write(`${This.firebaseProjectPath}/functions/package.json`, JSON.stringify(This.package, null, 2) );
//     resolve();
//   });
// }

function fix_node10(This) {
  return new Promise(function(resolve, reject) {
    _.set(This.package, 'engines.node', '10')

    fs.write(`${This.firebaseProjectPath}/functions/package.json`, JSON.stringify(This.package, null, 2) );
    resolve();
  });
};

async function fix_isFirebase(This) {
  log(chalk.red(`This is not a firebase project. Please use ${chalk.bold('firebase-init')} to set up.`));
  throw '';
  return;
};

function fix_deps(This) {
  return new Promise(function(resolve, reject) {
    This.package.dependencies = This.package.dependencies || {};
    This.package.devDependencies = This.package.devDependencies || {};

    fs.write(`${This.firebaseProjectPath}/functions/package.json`, JSON.stringify(This.package, null, 2) );
    resolve();
  });
};

async function fix_fbf(This) {
  return await installPkg('firebase-functions')
};
async function fix_fba(This) {
  return await installPkg('firebase-admin')
};
async function fix_bem(This) {
  return await installPkg('backend-manager')
};
// async function fix_bea(This) {
//   return await installPkg('backend-assistant')
// };
// async function fix_ujp(This) {
//   return await installPkg('ultimate-jekyll-poster')
// };
async function fix_fbTesting(This) {
  return await installPkg('@firebase/testing', '', '--save-dev')
};
async function fix_mocha(This) {
  return await installPkg('mocha', '', '--save-dev')
};

function fix_gitignore(This) {
  return new Promise(function(resolve, reject) {
    let gi = (fs.read(path.resolve(`${__dirname}/../../templates/gitignore.md`)));
    if (This.gitignore.match(bem_giRegexOuter)) {
      This.gitignore = This.gitignore.replace(bem_giRegexOuter, gi);
    } else {
      This.gitignore = gi;
    }
    This.gitignore = This.gitignore.replace(/\n\s*\n$/mg, '\n')
    // This.gitignore = `${This.gitignore}\n${gi}`.replace(/$\n/m,'');
    // This.gitignore = This.gitignore.replace(/$\n/m,'');
    fs.write(`${This.firebaseProjectPath}/functions/.gitignore`, This.gitignore);
    resolve();
  });
};

function fix_firebaseRules(This) {
  return new Promise(function(resolve, reject) {
    _.set(This.firebaseJSON, 'firestore.rules', "firestore.rules")
    fs.write(`${This.firebaseProjectPath}/firebase.json`, JSON.stringify(This.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_firebaseIndexes(This) {
  return new Promise(function(resolve, reject) {
    _.set(This.firebaseJSON, 'firestore.indexes', "")
    fs.write(`${This.firebaseProjectPath}/firebase.json`, JSON.stringify(This.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_fsrules(This) {
  return new Promise(function(resolve, reject) {
    let path = `${This.firebaseProjectPath}/firestore.rules`;
    let exists = fs.exists(path);
    let contents = fs.read(path) || '';

    if (!exists || !contents) {
      log(chalk.yellow(`Writing new firestore.rules file...`));
      fs.write(path, This.default.firestoreRulesWhole)
      contents = fs.read(path) || '';
    }

    let hasTemplate = contents.match(bem_fsRulesRegex) || contents.match(bem_fsRulesBackupRegex);

    if (!hasTemplate) {
      log(chalk.red(`Could not find rules template. Please edit firestore.rules file and add`), chalk.red(`{{backend-manager}}`), chalk.red(`to it.`));
      reject()
    }

    let matchesVersion = contents.match(This.default.firestoreRulesVersionRegex);
    if (!matchesVersion) {
      // console.log('replace wih', This.default.firestoreRulesCore);
      contents = contents.replace(bem_fsRulesBackupRegex, This.default.firestoreRulesCore)
      contents = contents.replace(bem_fsRulesRegex, This.default.firestoreRulesCore)
      fs.write(path, contents)
      log(chalk.yellow(`Writing core rules to firestore.rules file...`));
    }
    resolve();
  });
};

function fix_fsindexes(This) {
  return new Promise(function(resolve, reject) {
    fs.remove(`${This.firebaseProjectPath}/firestore.indexes.json`)
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



  async function cmd_configGet(This) {
    return new Promise(function(resolve, reject) {
      let cmd = exec(`firebase functions:config:get > ${This.firebaseProjectPath}/functions/.runtimeconfig.json`, function (error, stdout, stderr) {
        if (error) {
          console.error(error);
          reject(error);
        } else {
          console.log(`Saving config to: ${This.firebaseProjectPath}/functions/.runtimeconfig.json`);
          console.log(stdout);
          resolve();
        }
      });
    });
  }

  async function cmd_configSet(This) {
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

  async function cmd_configUnset(This) {
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
  } else if (type == 'dev' || type == '--save-dev') {
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
