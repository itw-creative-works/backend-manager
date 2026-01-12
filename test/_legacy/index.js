const package = require('../package.json');
const assert = require('assert');

beforeEach(() => {
});

before(() => {
});

after(() => {
});

/*
 * ============
 *  Test Cases
 * ============
 */
describe(`${package.name}`, () => {
  describe('.dependencies()', () => {
    Object.keys(package.dependencies).forEach((dependency) => {
      it(`should load ${dependency}`, () => {
        try {
          const dep = require(dependency);
          assert.ok(dep);
        } catch (e) {
          assert.fail(`Failed to load ${dependency}: ${e.message}`);
        }
      });
    });
  });
})
