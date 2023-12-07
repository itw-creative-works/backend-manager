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
  const Manager = (new (require('../src/manager/index.js'))).init(exports, {
    setupFunctionsIdentity: false,
    log: true,
    serviceAccountPath: '../ultimate-jekyll-firebase/functions/service-account.json',
    backendManagerConfigPath: '../ultimate-jekyll-firebase/functions/backend-manager-config.json',
  });
  const options = {
    refetch: true,
    // log: true,
    today: '2024-01-01T01:00:00.000Z',
  }

  async function instance(instanceOptions) {
    instanceOptions = instanceOptions || {};

    const ops = JSON.parse(JSON.stringify(options));
    const lib = Manager.Usage();

    ops.clear = instanceOptions.clear;

    await lib.init(Manager.Assistant(), ops);
    return lib;
  }

  describe('.usage()', () => {
    describe('unauthenticated', () => {
      it('should clear correctly', async () => {
        const lib = await instance({clear: true});

        return assert.equal(true, true);
      });

      it('should initialize correctly', async () => {
        const lib = await instance();

        return assert.deepStrictEqual({
          requests: {
            total: 0,
            period: 0,
            last: {
              id: '',
              timestamp: '1970-01-01T00:00:00.000Z',
              timestampUNIX: 0,
            },
          },
        }, lib.user.usage);
      });

      it('should increment correctly', async () => {
        const lib = await instance();

        lib.increment('requests', 1, {id: 'increment'});

        return assert.deepStrictEqual({
          requests: {
            total: 1,
            period: 1,
            last: {
              id: 'increment',
              timestamp: '2024-01-01T01:00:00.000Z',
              timestampUNIX: 1704070800,
            },
          },
        }, lib.user.usage);
      });

      it('should decrement correctly', async () => {
        const lib = await instance();

        lib.increment('requests', -1, {id: 'decrement'});

        return assert.deepStrictEqual({
          requests: {
            total: -1,
            period: -1,
            last: {
              id: 'decrement',
              timestamp: '2024-01-01T01:00:00.000Z',
              timestampUNIX: 1704070800,
            },
          },
        }, lib.user.usage);
      });

      it('should validate correctly (under)', async () => {
        const lib = await instance();

        lib.increment('requests', 1, {id: 'decrement'});

        const result = await lib.validate('requests').catch(e => e);

        return assert.equal(true, result);
      });

      it('should validate correctly (over)', async () => {
        const lib = await instance();

        lib.increment('requests', 9999999, {id: 'decrement'});

        const result = await lib.validate('requests').catch(e => e);

        // Should be an errors
        return assert.equal(true, result instanceof Error);

      });

      it('should update correctly', async () => {
        const lib = await instance();

        lib.increment('requests', 1, {id: 'update'});

        await lib.update();

        return assert.deepStrictEqual({
          requests: {
            total: 1,
            period: 1,
            last: {
              id: 'update',
              timestamp: '2024-01-01T01:00:00.000Z',
              timestampUNIX: 1704070800,
            },
          },
        }, lib.storage.get('users.127_0_0_1.usage').value());
      });
    });

  });

})
