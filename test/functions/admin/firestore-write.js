/**
 * Test: Admin Firestore Write
 * Tests the admin:firestore-write command
 * Requires admin authentication
 */
const TEST_PATH = '_test/integration-test-doc';

module.exports = {
  description: 'Admin Firestore write operation',
  type: 'group',
  tests: [
    // Test 1: Admin auth should succeed
    {
      name: 'admin-auth-succeeds',
      auth: 'admin',
      timeout: 15000,

      async run({ http, assert }) {
        const testData = {
          testField: 'test-value',
          timestamp: new Date().toISOString(),
          nested: {
            field1: 'value1',
            field2: 123,
          },
        };

        // Test writing to Firestore with admin auth
        const writeResponse = await http.command('admin:firestore-write', {
          path: TEST_PATH,
          document: testData,
          options: {
            merge: true,
            metadataTag: 'test:integration-test',
          },
        });

        assert.isSuccess(writeResponse, 'Firestore write should succeed with admin auth');
        assert.hasProperty(writeResponse, 'data.path', 'Response should contain path');
        assert.equal(
          writeResponse.data.path,
          TEST_PATH,
          'Response path should match request path'
        );

        // Test writing with dynamic path placeholder {pushId}
        const pushIdPath = '_test/{pushId}';
        const pushIdResponse = await http.command('admin:firestore-write', {
          path: pushIdPath,
          document: { test: 'pushId-test', type: 'dynamic-id-test' },
        });

        assert.isSuccess(pushIdResponse, 'Firestore write with {pushId} should succeed');
        assert.hasProperty(pushIdResponse, 'data.path', 'Response should contain generated path');
        assert.notEqual(
          pushIdResponse.data.path,
          pushIdPath,
          'Path should have {pushId} replaced'
        );
        assert.ok(
          !pushIdResponse.data.path.includes('{pushId}'),
          'Path should not contain {pushId} placeholder'
        );

        return { success: true };
      },

      async cleanup({ firestore }) {
        // Clean up test documents using direct Firestore access if available
        if (firestore) {
          try {
            await firestore.delete(TEST_PATH);
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      },
    },

    // Test 2: Unauthenticated should fail
    {
      name: 'unauthenticated-rejected',
      auth: 'none',
      timeout: 15000,

      async run({ http, assert }) {
        const writeResponse = await http.command('admin:firestore-write', {
          path: TEST_PATH,
          document: { test: 'should-fail' },
        });

        assert.isError(writeResponse, 401, 'Firestore write should fail without authentication');

        return { success: true };
      },
    },

    // Test 3: Authenticated non-admin should fail
    {
      name: 'non-admin-rejected',
      auth: 'user',
      timeout: 15000,

      async run({ http, assert }) {
        const writeResponse = await http.command('admin:firestore-write', {
          path: TEST_PATH,
          document: { test: 'should-fail' },
        });

        assert.isError(writeResponse, 401, 'Firestore write should fail for non-admin user');

        return { success: true };
      },
    },
  ],
};
