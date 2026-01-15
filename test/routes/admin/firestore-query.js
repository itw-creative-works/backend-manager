/**
 * Test: POST /admin/firestore/query
 * Tests the admin Firestore query endpoint
 * Requires admin authentication
 */
const TEST_COLLECTION = '_test_query';

module.exports = {
  description: 'Admin Firestore query operation',
  type: 'suite',
  timeout: 30000,

  tests: [
    // Test 1: Setup - write test documents
    {
      name: 'setup-test-documents',
      async run({ http, assert, state }) {
        state.testDocs = [
          { name: 'doc1', category: 'alpha', value: 10 },
          { name: 'doc2', category: 'alpha', value: 20 },
          { name: 'doc3', category: 'beta', value: 30 },
        ];

        for (let i = 0; i < state.testDocs.length; i++) {
          const doc = state.testDocs[i];
          const response = await http.as('admin').post('admin/firestore', {
            path: `${TEST_COLLECTION}/doc${i + 1}`,
            document: doc,
          });
          assert.isSuccess(response, `Setup: Writing doc${i + 1} should succeed`);
        }
      },
    },

    // Test 2: Query all documents in collection
    {
      name: 'query-all-documents',
      async run({ http, assert, state }) {
        const queryResponse = await http.as('admin').post('admin/firestore/query', {
          queries: [
            { collection: TEST_COLLECTION },
          ],
        });

        assert.isSuccess(queryResponse, 'Query should succeed');
        assert.ok(
          Array.isArray(queryResponse.data),
          'Response should be an array'
        );
        assert.ok(
          queryResponse.data.length >= 3,
          `Should find at least 3 documents, found ${queryResponse.data.length}`
        );
      },
    },

    // Test 3: Query with where clause
    {
      name: 'query-with-where',
      async run({ http, assert }) {
        const queryResponse = await http.as('admin').post('admin/firestore/query', {
          queries: [
            {
              collection: TEST_COLLECTION,
              where: [
                { field: 'category', operator: '==', value: 'alpha' },
              ],
            },
          ],
        });

        assert.isSuccess(queryResponse, 'Query with where should succeed');
        assert.ok(
          Array.isArray(queryResponse.data),
          'Response should be an array'
        );
        assert.equal(
          queryResponse.data.length,
          2,
          'Should find exactly 2 alpha documents'
        );

        queryResponse.data.forEach(doc => {
          assert.equal(doc.data.category, 'alpha', 'All results should be category alpha');
        });
      },
    },

    // Test 4: Query with limit
    {
      name: 'query-with-limit',
      async run({ http, assert }) {
        const queryResponse = await http.as('admin').post('admin/firestore/query', {
          queries: [
            {
              collection: TEST_COLLECTION,
              limit: 2,
            },
          ],
        });

        assert.isSuccess(queryResponse, 'Query with limit should succeed');
        assert.ok(
          queryResponse.data.length <= 2,
          `Should return at most 2 documents, got ${queryResponse.data.length}`
        );
      },
    },

    // Test 5: Query with orderBy
    {
      name: 'query-with-orderBy',
      async run({ http, assert }) {
        const queryResponse = await http.as('admin').post('admin/firestore/query', {
          queries: [
            {
              collection: TEST_COLLECTION,
              orderBy: [
                { field: 'value', order: 'desc' },
              ],
            },
          ],
        });

        assert.isSuccess(queryResponse, 'Query with orderBy should succeed');
        assert.ok(
          Array.isArray(queryResponse.data) && queryResponse.data.length >= 2,
          'Should have at least 2 results to verify order'
        );

        for (let i = 0; i < queryResponse.data.length - 1; i++) {
          assert.ok(
            queryResponse.data[i].data.value >= queryResponse.data[i + 1].data.value,
            'Results should be in descending order by value'
          );
        }
      },
    },

    // Test 6: Query with empty collection returns empty array
    {
      name: 'query-empty-collection',
      async run({ http, assert }) {
        const queryResponse = await http.as('admin').post('admin/firestore/query', {
          queries: [
            { collection: '_test_nonexistent_collection_12345' },
          ],
        });

        assert.isSuccess(queryResponse, 'Query on empty collection should succeed');
        assert.ok(
          Array.isArray(queryResponse.data),
          'Response should be an array'
        );
        assert.equal(
          queryResponse.data.length,
          0,
          'Empty collection should return empty array'
        );
      },
    },

    // Test 7: Query with no collection specified returns empty
    {
      name: 'query-no-collection',
      async run({ http, assert }) {
        const queryResponse = await http.as('admin').post('admin/firestore/query', {
          queries: [{}],
        });

        assert.isSuccess(queryResponse, 'Query with no collection should succeed (returns empty)');
        assert.ok(
          Array.isArray(queryResponse.data),
          'Response should be an array'
        );
      },
    },

    // Test 8: Unauthenticated request fails
    {
      name: 'unauthenticated-rejected',
      async run({ http, assert }) {
        const queryResponse = await http.as('none').post('admin/firestore/query', {
          queries: [{ collection: TEST_COLLECTION }],
        });

        assert.isError(queryResponse, 401, 'Query should fail without authentication');
      },
    },

    // Test 9: Non-admin user fails
    {
      name: 'non-admin-rejected',
      async run({ http, assert }) {
        const queryResponse = await http.as('basic').post('admin/firestore/query', {
          queries: [{ collection: TEST_COLLECTION }],
        });

        assert.isError(queryResponse, 403, 'Query should fail for non-admin user');
      },
    },

    // Test 10: Cleanup
    {
      name: 'cleanup',
      async run({ firestore }) {
        try {
          await firestore.delete(`${TEST_COLLECTION}/doc1`);
          await firestore.delete(`${TEST_COLLECTION}/doc2`);
          await firestore.delete(`${TEST_COLLECTION}/doc3`);
        } catch (error) {
          // Ignore cleanup errors
        }
      },
    },
  ],
};
