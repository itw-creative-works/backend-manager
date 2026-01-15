/**
 * Test: admin:database-write
 * Tests the admin Realtime Database write command
 * Requires admin authentication
 * Note: There's a bug in the API - line 19 checks `if (payload.user.roles.admin)` but should be `if (!payload.user.roles.admin)`
 */
const TEST_PATH = '_test/database-write-test';

module.exports = {
  description: 'Admin Realtime Database write operation',
  type: 'group',
  tests: [
    // Test 1: Admin can write data
    {
      name: 'admin-write-succeeds',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const testData = {
          testField: 'database-write-test-value',
          timestamp: new Date().toISOString(),
          nested: {
            field1: 'nested-value',
            field2: 456,
          },
        };

        const writeResponse = await http.command('admin:database-write', {
          path: TEST_PATH,
          document: testData,
        });

        assert.isSuccess(writeResponse, 'Database write should succeed with admin auth');
        assert.hasProperty(writeResponse, 'data.testField', 'Response should contain written data');
        assert.equal(
          writeResponse.data.testField,
          'database-write-test-value',
          'Response data should match input'
        );
      },
    },

    // Test 2: Verify written data can be read back
    {
      name: 'verify-write-persisted',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const readResponse = await http.command('admin:database-read', {
          path: TEST_PATH,
        });

        assert.isSuccess(readResponse, 'Reading written data should succeed');
        assert.equal(
          readResponse.data.testField,
          'database-write-test-value',
          'Persisted data should match written data'
        );
        assert.equal(
          readResponse.data.nested.field2,
          456,
          'Nested data should be persisted'
        );
      },
    },

    // Test 3: Can overwrite existing data
    {
      name: 'overwrite-succeeds',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const newData = {
          testField: 'updated-value',
          newField: 'this-is-new',
        };

        const writeResponse = await http.command('admin:database-write', {
          path: TEST_PATH,
          document: newData,
        });

        assert.isSuccess(writeResponse, 'Overwrite should succeed');
        assert.equal(
          writeResponse.data.testField,
          'updated-value',
          'Response should have updated value'
        );

        // Verify the data was actually overwritten (not merged)
        const readResponse = await http.command('admin:database-read', {
          path: TEST_PATH,
        });

        assert.isSuccess(readResponse, 'Reading overwritten data should succeed');
        assert.equal(
          readResponse.data.testField,
          'updated-value',
          'Data should be updated'
        );
        assert.ok(
          !readResponse.data.nested,
          'Previous nested data should be gone (set replaces, not merges)'
        );
      },
    },

    // Test 4: Missing path returns 400 error
    {
      name: 'missing-path-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const writeResponse = await http.command('admin:database-write', {
          document: { test: 'data' },
        });

        assert.isError(writeResponse, 400, 'Missing path should return 400');
      },
    },

    // Test 5: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const writeResponse = await http.command('admin:database-write', {
          path: TEST_PATH,
          document: { test: 'should-fail' },
        });

        assert.isError(writeResponse, 401, 'Database write should fail without authentication');
      },
    },

    // Test 6: Non-admin user fails
    {
      name: 'non-admin-rejected',
      auth: 'basic',
      timeout: 15000,

      async run({ http, assert }) {
        const writeResponse = await http.command('admin:database-write', {
          path: TEST_PATH,
          document: { test: 'should-fail' },
        });

        assert.isError(writeResponse, 403, 'Database write should fail for non-admin user');
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
