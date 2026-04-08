/**
 * Test: Manager.storage()
 * Unit tests for the lowdb-backed local JSON storage wrapper
 *
 * Run: npx mgr test helpers/storage
 *
 * Covers:
 * - get/set/write operations
 * - Nested path access
 * - Default values
 * - setState/getState
 * - Persistence across reads
 * - Chaining API (.set().write(), .get().value())
 */
const path = require('path');
const jetpack = require('fs-jetpack');
const os = require('os');

// Create a minimal Manager mock with storage()
const STORAGE_DIR = path.join(os.tmpdir(), `bem-storage-test-${Date.now()}`);

function createStorage(name) {
  const _ = require('lodash');
  const { LowSync } = require('lowdb');
  const { JSONFileSync } = require('lowdb/node');
  const location = path.join(STORAGE_DIR, `${name}.json`);

  jetpack.write(location, {});

  const db = new LowSync(new JSONFileSync(location), {});
  db.read();

  return {
    _db: db,
    _location: location,
    get(p, defaultValue) {
      const result = _.get(db.data, p, defaultValue);
      return { value() { return result; } };
    },
    set(p, value) { _.set(db.data, p, value); return this; },
    write() { db.write(); return this; },
    getState() { return db.data; },
    setState(data) { db.data = data; return this; },
  };
}

module.exports = {
  description: 'Manager.storage()',
  type: 'group',

  tests: [
    {
      name: 'set-and-get-simple',
      async run({ assert }) {
        const storage = createStorage('simple');
        storage.set('key', 'value').write();
        const result = storage.get('key').value();
        assert.equal(result, 'value', 'Should get what was set');
      },
    },

    {
      name: 'get-returns-default-for-missing',
      async run({ assert }) {
        const storage = createStorage('defaults');
        const result = storage.get('nonexistent', 'fallback').value();
        assert.equal(result, 'fallback', 'Should return default for missing key');
      },
    },

    {
      name: 'get-returns-undefined-without-default',
      async run({ assert }) {
        const storage = createStorage('nodefault');
        const result = storage.get('nonexistent').value();
        assert.equal(result, undefined, 'Should return undefined without default');
      },
    },

    {
      name: 'set-nested-path',
      async run({ assert }) {
        const storage = createStorage('nested');
        storage.set('a.b.c', 42).write();
        const result = storage.get('a.b.c').value();
        assert.equal(result, 42, 'Should handle nested paths');
      },
    },

    {
      name: 'set-preserves-existing-data',
      async run({ assert }) {
        const storage = createStorage('preserve');
        storage.set('first', 1).write();
        storage.set('second', 2).write();
        assert.equal(storage.get('first').value(), 1, 'First key should still exist');
        assert.equal(storage.get('second').value(), 2, 'Second key should exist');
      },
    },

    {
      name: 'set-chaining',
      async run({ assert }) {
        const storage = createStorage('chain');
        storage.set('a', 1).set('b', 2).write();
        assert.equal(storage.get('a').value(), 1, 'First chained set');
        assert.equal(storage.get('b').value(), 2, 'Second chained set');
      },
    },

    {
      name: 'set-object-value',
      async run({ assert }) {
        const storage = createStorage('object');
        storage.set('user.usage', { daily: 5, monthly: 10 }).write();
        const usage = storage.get('user.usage', {}).value();
        assert.equal(usage.daily, 5, 'Should store object values');
        assert.equal(usage.monthly, 10, 'Should store nested object values');
      },
    },

    {
      name: 'getState-returns-all-data',
      async run({ assert }) {
        const storage = createStorage('getstate');
        storage.set('x', 1).set('y', 2).write();
        const state = storage.getState();
        assert.equal(state.x, 1, 'getState should include x');
        assert.equal(state.y, 2, 'getState should include y');
      },
    },

    {
      name: 'setState-replaces-all-data',
      async run({ assert }) {
        const storage = createStorage('setstate');
        storage.set('old', 'data').write();
        storage.setState({}).write();
        const result = storage.get('old').value();
        assert.equal(result, undefined, 'setState({}) should clear all data');
      },
    },

    {
      name: 'write-persists-to-disk',
      async run({ assert }) {
        const storage = createStorage('persist');
        storage.set('persisted', true).write();

        // Read the file directly to verify
        const raw = JSON.parse(jetpack.read(storage._location));
        assert.equal(raw.persisted, true, 'Data should be written to disk');
      },
    },

    {
      name: 'data-survives-re-read',
      async run({ assert }) {
        const _ = require('lodash');
        const { LowSync } = require('lowdb');
        const { JSONFileSync } = require('lowdb/node');

        // Write with one instance
        const storage1 = createStorage('reread');
        storage1.set('survivor', 'yes').write();

        // Read with a fresh instance from the same file
        const db2 = new LowSync(new JSONFileSync(storage1._location), {});
        db2.read();
        const result = _.get(db2.data, 'survivor');
        assert.equal(result, 'yes', 'Data should survive a fresh read');
      },
    },

    {
      name: 'get-default-object-for-usage-pattern',
      async run({ assert }) {
        const storage = createStorage('usage-pattern');
        // Mimics usage.js: storage.get(`${path}.usage`, {}).value()
        const usage = storage.get('nonexistent-user.usage', {}).value();
        assert.ok(typeof usage === 'object', 'Should return empty object default');
        assert.equal(Object.keys(usage).length, 0, 'Default object should be empty');
      },
    },

    {
      name: 'cleanup',
      async run() {
        // Clean up test files
        jetpack.remove(STORAGE_DIR);
      },
    },
  ],
};
