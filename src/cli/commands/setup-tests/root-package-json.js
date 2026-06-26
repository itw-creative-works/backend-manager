const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const path = require('path');

class RootPackageJsonTest extends BaseTest {
  getName() {
    return 'root package.json proxy scripts';
  }

  async run() {
    const rootPath = path.join(this.self.firebaseProjectPath, 'package.json');

    if (!jetpack.exists(rootPath)) {
      return false;
    }

    const rootPkg = JSON.parse(jetpack.read(rootPath));
    const expectedScripts = this._getExpectedScripts();
    const rootScripts = rootPkg.scripts || {};

    for (const [name, command] of Object.entries(expectedScripts)) {
      if (rootScripts[name] !== command) {
        return false;
      }
    }

    return true;
  }

  async fix() {
    const rootPath = path.join(this.self.firebaseProjectPath, 'package.json');
    const existing = jetpack.exists(rootPath) ? JSON.parse(jetpack.read(rootPath)) : {};
    const expectedScripts = this._getExpectedScripts();

    existing.name = existing.name || `${this.context.package.name || 'functions'}-root`;
    existing.private = true;
    existing.scripts = Object.assign(existing.scripts || {}, expectedScripts);

    jetpack.write(rootPath, JSON.stringify(existing, null, 2));
  }

  _getExpectedScripts() {
    const bemPackage = require('../../../../package.json');
    const projectScripts = bemPackage.projectScripts || {};
    const scripts = {};

    for (const [name, command] of Object.entries(projectScripts)) {
      scripts[name] = `cd functions && ${command}`;
    }

    scripts.preinstall = `cd functions && npm install && echo "\\n  ✓ Dependencies installed in functions/ (not project root)\\n"`;

    return scripts;
  }
}

module.exports = RootPackageJsonTest;
