const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const path = require('path');

// Regex patterns
const bem_giRegexOuter = /# BEM>>>(.*\n?)# <<<BEM/sg;

class GitignoreTest extends BaseTest {
  getName() {
    return 'has correct .gitignore';
  }

  async run() {
    let match = this.self.gitignore.match(bem_giRegexOuter);
    if (!match) {
      return false;
    } else {
      let gitignore = jetpack.read(path.resolve(`${__dirname}/../../../../templates/gitignore.md`));
      if (!gitignore) {
        throw new Error('Could not read gitignore template file');
      }
      let file = gitignore.match(bem_giRegexOuter) ? RegExp.$1 : 'BAD1';
      let file2 = match[0].match(bem_giRegexOuter) ? RegExp.$1 : 'BAD2';
      return file === file2;
    }
  }

  async fix() {
    let gi = jetpack.read(path.resolve(`${__dirname}/../../../../templates/gitignore.md`));
    if (this.self.gitignore.match(bem_giRegexOuter)) {
      this.self.gitignore = this.self.gitignore.replace(bem_giRegexOuter, gi);
    } else {
      this.self.gitignore = gi;
    }
    this.self.gitignore = this.self.gitignore.replace(/\n\s*\n$/mg, '\n');
    jetpack.write(`${this.self.firebaseProjectPath}/functions/.gitignore`, this.self.gitignore);
  }
}

module.exports = GitignoreTest;
