/**
 * Test: admin:database-read
 * Tests the admin Realtime Database read command
 * Requires admin authentication
 */
const TEST_PATH = '_test/database-read-test';

module.exports = {
  description: 'Admin Realtime Database read operation',
  type: 'group',
  tests: [
    // Test 1: Setup - write test data first
    {
      name: 'setup-test-data',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        // Write test data to read later
        const testData = {
          testField: 'database-read-test-value',
          timestamp: new Date().toISOString(),
          nested: {
            field1: 'nested-value',
            field2: 123,
          },
        };

        const writeResponse = await http.command('admin:database-write', {
          path: TEST_PATH,
          document: testData,
        });

        assert.isSuccess(writeResponse, 'Setup: Database write should succeed');
      },
    },

    // Test 2: Admin can read data
    {
      name: 'admin-read-succeeds',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const readResponse = await http.command('admin:database-read', {
          path: TEST_PATH,
        });

        assert.isSuccess(readResponse, 'Database read should succeed with admin auth');
        assert.hasProperty(readResponse, 'data.testField', 'Response should contain test data');
        assert.equal(
          readResponse.data.testField,
          'database-read-test-value',
          'Read data should match written data'
        );
        assert.hasProperty(readResponse, 'data.nested.field1', 'Response should contain nested data');
        assert.equal(
          readResponse.data.nested.field2,
          123,
          'Nested field should match written data'
        );
      },
    },

    // Test 3: Reading non-existent path returns empty/null
    {
      name: 'read-nonexistent-returns-null',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const readResponse = await http.command('admin:database-read', {
          path: '_test/nonexistent-path-12345',
        });

        assert.isSuccess(readResponse, 'Reading non-existent path should succeed');
        // Realtime Database returns null for non-existent paths
        // However, emulator may return empty object {} in some cases
        const data = readResponse.data;
        const isEmpty = data === null
          || data === undefined
          || (typeof data === 'object' && Object.keys(data).length === 0);
        assert.ok(
          isEmpty,
          `Non-existent path should return null, undefined, or empty object, got: ${JSON.stringify(data)}`
        );
      },
    },

    // Test 4: Missing path returns 400 error
    {
      name: 'missing-path-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const readResponse = await http.command('admin:database-read', {});

        assert.isError(readResponse, 400, 'Missing path should return 400');
      },
    },

    // Test 5: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const readResponse = await http.command('admin:database-read', {
          path: TEST_PATH,
        });

        assert.isError(readResponse, 401, 'Database read should fail without authentication');
      },
    },

    // Test 6: Non-admin user fails
    {
      name: 'non-admin-rejected',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const readResponse = await http.command('admin:database-read', {
          path: TEST_PATH,
        });

        assert.isError(readResponse, 401, 'Database read should fail for non-admin user');
      },
    },

    // Test 7: Cleanup
    {
      name: 'cleanup',
      auth: 'admin',
      timeout: 15000,

      async run({ http }) {
        // Clean up test data by writing null
        await http.command('admin:database-write', {
          path: TEST_PATH,
          document: null,
        });
      },
    },
  ],
};
