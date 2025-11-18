const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');

class FunctionsPackageTest extends BaseTest {
  getName() {
    return 'functions level package.json exists';
  }

  async run() {
    return !!this.context.package
      && !!this.context.package.dependencies
      && !!this.context.package.devDependencies
      && !!this.context.package.version;
  }

  async fix() {
    this.context.package.dependencies = this.context.package.dependencies || {};
    this.context.package.devDependencies = this.context.package.devDependencies || {};
    this.context.package.version = this.context.package.version || '0.0.1';

    jetpack.write(`${this.self.firebaseProjectPath}/functions/package.json`, JSON.stringify(this.context.package, null, 2));
  }
}

module.exports = FunctionsPackageTest;
