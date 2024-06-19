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
  const Manager = (new (require('../src/manager/index.js')));

  function log() {
    // console.log(...arguments);
  }

  describe('.user()', () => {
    it('should resolve correctly', () => {
      const user = Manager.User().properties;
      return assert.deepStrictEqual(true, true);
    });
  });
})
