const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const path = require('path');

class NpmProjectScriptsTest extends BaseTest {
  getName() {
    return 'has all BEM project scripts';
  }

  async run() {
    const bemPackage = require('../../../../package.json');
    const projectScripts = bemPackage.projectScripts || {};
    const consumerScripts = this.context.package.scripts || {};

    // Check if all projectScripts exist in consumer
    for (const [name, command] of Object.entries(projectScripts)) {
      if (consumerScripts[name] !== command) {
        return false;
      }
    }

    return true;
  }

  async fix() {
    const bemPackage = require('../../../../package.json');
    const projectScripts = bemPackage.projectScripts || {};

    // Ensure scripts object exists
    this.context.package.scripts = this.context.package.scripts || {};

    // Copy all projectScripts to consumer
    for (const [name, command] of Object.entries(projectScripts)) {
      this.context.package.scripts[name] = command;
    }

    // Write updated package.json
    jetpack.write(
      path.join(this.self.firebaseProjectPath, 'functions', 'package.json'),
      JSON.stringify(this.context.package, null, 2)
    );
  }
}

module.exports = NpmProjectScriptsTest;
