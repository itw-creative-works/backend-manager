const BaseTest = require('./base-test');
const jetpack = require('fs-jetpack');
const path = require('path');
const powertools = require('node-powertools');

class PublicHtmlFilesTest extends BaseTest {
  getName() {
    return 'create public .html files';
  }

  async run() {
    const self = this.self;
    const options = {url: self.bemConfigJSON.brand.url};

    const templateIndex = jetpack.read(path.resolve(`${__dirname}/../../../../templates/public/index.html`));
    jetpack.write(`${self.firebaseProjectPath}/public/index.html`,
      powertools.template(templateIndex, options)
    );

    const template404 = jetpack.read(path.resolve(`${__dirname}/../../../../templates/public/404.html`));
    jetpack.write(`${self.firebaseProjectPath}/public/404.html`,
      powertools.template(template404, options)
    );

    return true;
  }

  async fix() {
    throw new Error('No automatic fix available for this test');
  }
}

module.exports = PublicHtmlFilesTest;
