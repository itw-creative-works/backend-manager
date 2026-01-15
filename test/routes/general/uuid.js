/**
 * Test: UUID Route
 * Tests the new RESTful UUID endpoint using proper HTTP verbs
 */
module.exports = {
  description: 'UUID route',
  type: 'group',
  tests: [
    {
      name: 'v4-random-uuid',
      auth: 'none',
      timeout: 10000,

      async run({ http, assert }) {
        // POST /backend-manager/general/uuid
        const response = await http.post('general/uuid', {
          version: '4',
        });

        assert.isSuccess(response, 'UUID v4 generation should succeed');
        assert.hasProperty(response, 'data.uuid', 'Response should contain uuid');
        assert.match(
          response.data.uuid,
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          'UUID v4 should have correct format'
        );

        return { success: true };
      },
    },

    {
      name: 'v5-namespaced-uuid',
      auth: 'none',
      timeout: 10000,

      async run({ http, assert }) {
        const response = await http.post('general/uuid', {
          version: '5',
          name: 'test-name-for-uuid',
        });

        assert.isSuccess(response, 'UUID v5 generation should succeed');
        assert.hasProperty(response, 'data.uuid', 'Response should contain uuid');
        assert.match(
          response.data.uuid,
          /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          'UUID v5 should have correct format'
        );

        return { success: true };
      },
    },

    {
      name: 'v5-deterministic',
      auth: 'none',
      timeout: 10000,

      async run({ http, assert }) {
        const response1 = await http.post('general/uuid', {
          version: '5',
          name: 'test-name-for-uuid',
        });

        const response2 = await http.post('general/uuid', {
          version: '5',
          name: 'test-name-for-uuid',
        });

        assert.isSuccess(response1, 'First UUID v5 generation should succeed');
        assert.isSuccess(response2, 'Second UUID v5 generation should succeed');
        assert.equal(
          response1.data.uuid,
          response2.data.uuid,
          'UUID v5 should be deterministic - same input should produce same output'
        );

        return { success: true };
      },
    },

    {
      name: 'v5-requires-name',
      auth: 'none',
      timeout: 10000,

      async run({ http, assert }) {
        const response = await http.post('general/uuid', {
          version: '5',
        });

        assert.isError(response, 400, 'UUID v5 without name should return 400');

        return { success: true };
      },
    },

    {
      name: 'invalid-version-rejected',
      auth: 'none',
      timeout: 10000,

      async run({ http, assert }) {
        const response = await http.post('general/uuid', {
          version: '99',
        });

        assert.isError(response, 400, 'Invalid version should return 400');

        return { success: true };
      },
    },
  ],
};
