// CLI GUIDE:
// https://www.twilio.com/blog/how-to-build-a-cli-with-node-js
// https://www.npmjs.com/package/@dkundel/create-project

// https://www.sitepoint.com/javascript-command-line-interface-cli-node-js/
// https://github.com/sitepoint-editors/ginit

const arg = require('arg');
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

let bem_regex = /# BEM>>>(.*\n?)# <<<BEM/sg;
let bem_fsRulesRegex = /(\/\/\/---backend-manager---\/\/\/)(.*)(\/\/\/---------end---------\/\/\/)/sgm;
let bem_fsRulesBackupRegex = /({{\s*?backend-manager\s*?}})/sgm;
let MOCHA_PKG_SCRIPT = 'mocha ../test/ --recursive --timeout=10000'


function Main() {
}

Main.prototype.process = async function (args) {
  let This = this;
  this.options = {};
  this.argv = require('yargs').argv;
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
  if (this.options.i && (this.options.local || this.options.dev || this.options.development)) {
    await uninstallPkg('backend-manager');
    return await installPkg('file:../../backend-manager');
  }
  if (this.options.i && (this.options.live || this.options.prod || this.options.production)) {
    return await installPkg('backend-manager');
  }
  if (this.options.serve) {
    if (!this.options.quick && !this.options.q) {
    }
    await This.setup();
    await cmd_configGet(This);

    let port = this.argv.port || _.get(This.argv, '_', [])[1] || '5000';
    let ls = spawn('firebase', ['serve', '--port', port]);

    ls.stdout.on('data', (data) => {
      console.log(`${cleanOutput(data)}`);
    });
    ls.stderr.on('data', (data) => {
      console.error(`${cleanOutput(data)}`);
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
    let ls = spawn('firebase', ['deploy', '--only', 'functions,firestore:rules']);
    ls.stdout.on('data', (data) => {
      // console.log(`${cleanOutput(data)}`);
      console.log(`${cleanOutput(data)}`);
    });
    ls.stderr.on('data', (data) => {
      console.error(`${cleanOutput(data)}`);
      // ls = null;
    });

  }
  if (this.options['test']) {
    await This.setup();
    // let ls = spawn('npm', ['run', 'test']);
    let ls = spawn('firebase', ['emulators:exec', '--only', 'firestore', 'npm test']);
    ls.stdout.on('data', (data) => {
      console.log(`${cleanOutput(data)}`);
    });
    ls.stderr.on('data', (data) => {
      console.error(`${cleanOutput(data)}`);
    });
  }


};

module.exports = Main;


Main.prototype.setup = async function () {
  let This = this;
  log(chalk.green(`\n---- RUNNING SETUP ----`));
  this.package = fs.read(`${this.firebaseProjectPath}/functions/package.json`);
  this.gitignore = fs.read(`${this.firebaseProjectPath}/functions/.gitignore`);
  this.firebaseJSON = fs.read(`${this.firebaseProjectPath}/firebase.json`);
  this.firebaseRC = fs.read(`${this.firebaseProjectPath}/.firebaserc`);
  if (!this.package) {
    log(chalk.red(`Missing package.json :(`));
    return;
  }
  this.package = JSON.parse(this.package);
  this.firebaseJSON = JSON.parse(this.firebaseJSON);
  this.firebaseRC = JSON.parse(this.firebaseRC);

  this.default.firestoreRulesWhole = (fs.read(path.resolve(`${__dirname}/../../templates/firestore.rules`))).replace('-0.0.0-', `-${This.default.version}-`);
  this.default.firestoreRulesCore = this.default.firestoreRulesWhole.match(bem_fsRulesRegex)[0];
  this.default.firestoreRulesVersionRegex = new RegExp(`///---version-${This.default.version}---///`)

  // tests
  // await this.test('using updates backend-manager-clie', function () {
  //   return This.package.engines.node.toString() == '10';
  // }, fix_node10);
  log(chalk.black(`For Firebase project:`, chalk.bold(`${this.firebaseRC.projects.default}`)));
  await this.test('is a firebase project', async function () {
    let exists = fs.exists(`${This.firebaseProjectPath}/firebase.json`);
    return exists;
  }, fix_isFirebase);
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

  await this.test('using updated backend-assistant', async function () {
    let pkg = 'backend-assistant';
    let latest = semver.clean(await getPkgVersion(pkg));
    let mine = (This.package.dependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
    return isLocal(mine) || !(semver.gt(latest, mine));
  }, fix_bea);

  await this.test('using updated ultimate-jekyll-poster', async function () {
    let pkg = 'ultimate-jekyll-poster';
    let latest = semver.clean(await getPkgVersion(pkg));
    let mine = (This.package.dependencies[pkg] || '0.0.0').replace('^', '').replace('~', '');
    return isLocal(mine) || !(semver.gt(latest, mine));
  }, fix_ujp);

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
    return runtimeconfig.mailchimp &&
           runtimeconfig.mailchimp.key &&
           runtimeconfig.mailchimp.list_id &&

           runtimeconfig.backend_manager &&
           runtimeconfig.backend_manager.key &&

           runtimeconfig.github &&
           runtimeconfig.github.key &&
           runtimeconfig.github.user &&
           runtimeconfig.github.repo_website

  }, NOFIX);

  await this.test('using node 10', function () {
    return This.package.engines.node.toString() == '10';
  }, fix_node10);

  await this.test('has correct .gitignore', function () {
    return This.gitignore.match(bem_regex);
  }, fix_gitignore);

  await this.test('check firebase rules in JSON', function () {
    let firestore = _.get(This.firebaseJSON, 'firestore', {});
    return (firestore.rules == 'firestore.rules')
  }, fix_firebaseRules);

  await this.test('update backend-manager-tests.js', function () {
    fs.write(`${This.firebaseProjectPath}/test/backend-manager-tests.js`,
      (fs.read(path.resolve(`${__dirname}/../../templates/backend-manager-tests.js`)))
    )
    return true;
  }, NOFIX);

  await this.test('has mocha package.json script', function () {
    let script = _.get(This.package, 'scripts.test', '')
    return script == MOCHA_PKG_SCRIPT;
  }, fix_mochaScript);

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

  return;

  await this.test('deleted firestore indexes', function () {
    let indexes = fs.exists(`${This.firebaseProjectPath}/firestore.indexes.json`);
    return (!indexes);
  }, fix_fsindexes);

  // console.log(This.package);

};

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

}

function fix_mochaScript(This) {
  return new Promise(function(resolve, reject) {
    _.set(This.package, 'scripts.test', MOCHA_PKG_SCRIPT);
    fs.write(`${This.firebaseProjectPath}/functions/package.json`, JSON.stringify(This.package, null, 2) );
    resolve();
  });
}
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

async function fix_fbf(This) {
  return await installPkg('firebase-functions')
};
async function fix_fba(This) {
  return await installPkg('firebase-admin')
};
async function fix_bem(This) {
  return await installPkg('backend-manager')
};
async function fix_bea(This) {
  return await installPkg('backend-assistant')
};
async function fix_ujp(This) {
  return await installPkg('ultimate-jekyll-poster')
};
async function fix_fbTesting(This) {
  return await installPkg('@firebase/testing', '', '--save-dev')
};
async function fix_mocha(This) {
  return await installPkg('mocha', '', '--save-dev')
};

function fix_gitignore(This) {
  return new Promise(function(resolve, reject) {
    let gi = (fs.read(path.resolve(`${__dirname}/../../templates/gitignore.md`)));
    This.gitignore.replace(bem_regex, '');
    This.gitignore = `${This.gitignore}\n${gi}`.replace(/$\n/m,'');
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
      console.log('replace wih', This.default.firestoreRulesCore);
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
