/**
 * Test: GET/POST /admin/firestore
 * Tests the admin Firestore read/write endpoints
 * Requires admin authentication
 */
const TEST_PATH = '_test/firestore-test-doc';

module.exports = {
  description: 'Admin Firestore read/write operations',
  type: 'group',
  tests: [
    // Test 1: Setup - write a test document first
    {
      name: 'setup-test-document',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const testData = {
          testField: 'read-test-value',
          timestamp: new Date().toISOString(),
          nested: {
            field1: 'nested-value',
            field2: 42,
          },
        };

        const writeResponse = await http.post('admin/firestore', {
          path: TEST_PATH,
          document: testData,
        });

        assert.isSuccess(writeResponse, 'Setup: Firestore write should succeed');
      },
    },

    // Test 2: Admin can read document
    {
      name: 'admin-read-succeeds',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const readResponse = await http.get('admin/firestore', {
          path: TEST_PATH,
        });

        assert.isSuccess(readResponse, 'Firestore read should succeed with admin auth');
        assert.hasProperty(readResponse, 'data.testField', 'Response should contain test data');
        assert.equal(
          readResponse.data.testField,
          'read-test-value',
          'Read data should match written data'
        );
        assert.hasProperty(readResponse, 'data.nested.field1', 'Response should contain nested data');
        assert.equal(
          readResponse.data.nested.field2,
          42,
          'Nested field should match written data'
        );
      },
    },

    // Test 3: Reading non-existent document returns empty/undefined/null
    {
      name: 'read-nonexistent-returns-empty',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const readResponse = await http.get('admin/firestore', {
          path: '_test/nonexistent-document-12345',
        });

        assert.isSuccess(readResponse, 'Reading non-existent document should succeed');
        const isEmpty = readResponse.data === undefined
          || readResponse.data === null
          || (typeof readResponse.data === 'object' && Object.keys(readResponse.data).length === 0);
        assert.ok(isEmpty, 'Non-existent document should return undefined, null, or empty object');
      },
    },

    // Test 4: Missing path returns 400 error
    {
      name: 'missing-path-rejected',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const readResponse = await http.get('admin/firestore', {});

        assert.isError(readResponse, 400, 'Missing path should return 400');
      },
    },

    // Test 5: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const readResponse = await http.get('admin/firestore', {
          path: TEST_PATH,
        });

        assert.isError(readResponse, 401, 'Firestore read should fail without authentication');
      },
    },

    // Test 6: Non-admin user fails
    {
      name: 'non-admin-rejected',
      auth: 'user',
      timeout: 15000,

      async run({ http, assert }) {
        const readResponse = await http.get('admin/firestore', {
          path: TEST_PATH,
        });

        assert.isError(readResponse, 403, 'Firestore read should fail for non-admin user');
      },
    },

    // Test 7: Cleanup
    {
      name: 'cleanup',
      auth: 'admin',
      timeout: 15000,

      async run({ firestore }) {
        try {
          await firestore.delete(TEST_PATH);
        } catch (error) {
          // Ignore cleanup errors
        }
      },
    },
  ],
};
