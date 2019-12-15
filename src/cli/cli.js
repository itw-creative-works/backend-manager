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

  for (var i = 0; i < args.length; i++) {
    this.options[args[i]] = true;
  }
  // console.log(args);
  // console.log(options);
  if (this.options.v || this.options.version || this.options['-v'] || this.options['-version']) {
    console.log(`Backend manager is version: ${require('../../package.json').version}`);
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
    await This.setup();
    let port = this.argv.port || _.get(This.argv, '_', [])[1] || '5000';
    let nextRun = false;
    // console.log(This.options);
    // console.log(This.argv);
    // console.log('PORT', port);
    let cmd = exec(`firebase functions:config:get > ${this.firebaseProjectPath}/functions/.runtimeconfig.json`, function (error, stdout, stderr) {
      if (error) {
        console.error(`${error}`);
      } else {
        if (!nextRun) {
          nextRun = true;
          console.log(`Saving config to: ${this.firebaseProjectPath}/functions/.runtimeconfig.json`);
          let ls = spawn('firebase', ['serve', '--port', port]);

          ls.stdout.on('data', (data) => {
            console.log(`${data}`);
          });
          ls.stderr.on('data', (data) => {
            console.error(`${data}`);
            // ls = null;
          });
        }
      }
    });
  }
  if (this.options['config:get']) {
    let cmd = exec(`firebase functions:config:get > ${this.firebaseProjectPath}/functions/.runtimeconfig.json`, function (error, stdout, stderr) {
      if (error) {
        console.error(error);
      } else {
        console.log(`Saving config to: ${this.firebaseProjectPath}/functions/.runtimeconfig.json`);
        console.log(stdout);
      }
    });
  }

  if (this.options['config:set']) {
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
          } else {
            console.log(stdout);
          }
        });
      });

  }

  if (this.options.deploy) {
    await This.setup();
      let ls = spawn('firebase', ['deploy', '--only', 'functions']);
      ls.stdout.on('data', (data) => {
        console.log(`${data}`);
      });
      ls.stderr.on('data', (data) => {
        console.error(`${data}`);
        // ls = null;
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

  // tests
  // await this.test('using updates backend-manager-clie', function () {
  //   return This.package.engines.node.toString() == '10';
  // }, fix_node10);
  log(chalk.black(`For project:`, chalk.bold(`${this.firebaseRC.projects.default}`)));
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

  await this.test('using node 10', function () {
    return This.package.engines.node.toString() == '10';
  }, fix_node10);

  await this.test('has correct .gitignore', function () {
    return This.gitignore.match(bem_regex);
  }, fix_gitignore);

  await this.test('ignore firestore rules & indexes', function () {
    let firestore = _.get(This.firebaseJSON, 'firestore', {});
    return (firestore.rules == '' && firestore.indexes == '')
  }, fix_firebaseJSON);

  await this.test('deleted firestore rules', function () {
    let rules = fs.exists(`${This.firebaseProjectPath}/firestore.rules`);
    return (!rules);
  }, fix_fsrules);

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

function fix_node10(This) {
  return new Promise(function(resolve, reject) {
    _.set(This.package, 'engines.node', '10')

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

function fix_gitignore(This) {
  return new Promise(function(resolve, reject) {
    let gi = (fs.read(path.resolve(`${__dirname}/../templates/gitignore.md`)));
    This.gitignore.replace(bem_regex, '');
    This.gitignore = `${This.gitignore}\n${gi}`.replace(/$\n/m,'');
    fs.write(`${This.firebaseProjectPath}/functions/.gitignore`, This.gitignore);
    resolve();
  });
};

function fix_firebaseJSON(This) {
  return new Promise(function(resolve, reject) {
    _.set(This.firebaseJSON, 'firestore', {"rules": "", "indexes": ""})
    fs.write(`${This.firebaseProjectPath}/firebase.json`, JSON.stringify(This.firebaseJSON, null, 2));
    resolve();
  });
};

function fix_fsrules(This) {
  return new Promise(function(resolve, reject) {
    fs.remove(`${This.firebaseProjectPath}/firestore.rules`)
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



// HELPER

function isLocal(name) {
  return name.indexOf('file:') > -1;
}

function installPkg(name, version) {
  let v;
  if (name.indexOf('file:') > -1) {
    v = '';
  } else if (!version) {
    v = '@latest';
  } else {
    v = version;
  }
  let latest = version ? '' : '@latest';
  return new Promise(function(resolve, reject) {
    let command = `npm i ${name}${v}`;
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
