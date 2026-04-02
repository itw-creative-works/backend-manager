/**
 * Test: libraries/infer-contact.js
 * Unit tests for contact inference from email addresses
 *
 * AI tests only run when TEST_EXTENDED_MODE is set.
 */
const { inferContact, capitalize } = require('../../src/manager/libraries/infer-contact.js');

module.exports = {
  description: 'Infer contact from email',
  type: 'group',

  tests: [
    // ─── capitalize ───

    {
      name: 'capitalize-single-word',
      async run({ assert }) {
        assert.equal(capitalize('john'), 'John', 'Should capitalize first letter');
      },
    },

    {
      name: 'capitalize-multiple-words',
      async run({ assert }) {
        assert.equal(capitalize('john doe'), 'John Doe', 'Should capitalize each word');
      },
    },

    {
      name: 'capitalize-all-uppercase',
      async run({ assert }) {
        assert.equal(capitalize('JOHN'), 'John', 'Should lowercase after first letter');
      },
    },

    {
      name: 'capitalize-mixed-case',
      async run({ assert }) {
        assert.equal(capitalize('jOHN dOE'), 'John Doe', 'Should normalize mixed case');
      },
    },

    {
      name: 'capitalize-empty-string',
      async run({ assert }) {
        assert.equal(capitalize(''), '', 'Empty string should return empty');
      },
    },

    {
      name: 'capitalize-null',
      async run({ assert }) {
        assert.equal(capitalize(null), '', 'Null should return empty');
      },
    },

    {
      name: 'capitalize-undefined',
      async run({ assert }) {
        assert.equal(capitalize(undefined), '', 'Undefined should return empty');
      },
    },

    // ─── inferContact: returns empty without AI key ───

    {
      name: 'infer-contact-no-ai-returns-none',
      async run({ assert }) {
        // Without BACKEND_MANAGER_OPENAI_API_KEY, should return empty result
        const originalKey = process.env.BACKEND_MANAGER_OPENAI_API_KEY;
        delete process.env.BACKEND_MANAGER_OPENAI_API_KEY;

        try {
          const result = await inferContact('alice.wonderland@example.com');

          assert.equal(result.firstName, '', 'No first name without AI');
          assert.equal(result.lastName, '', 'No last name without AI');
          assert.equal(result.company, '', 'No company without AI');
          assert.equal(result.method, 'none', 'Method should be none');
          assert.equal(result.confidence, 0, 'Confidence should be 0');
        } finally {
          if (originalKey) {
            process.env.BACKEND_MANAGER_OPENAI_API_KEY = originalKey;
          }
        }
      },
    },

    // ─── inferContact: AI path (requires TEST_EXTENDED_MODE) ───

    {
      name: 'infer-contact-ai',
      skip: !process.env.TEST_EXTENDED_MODE ? 'TEST_EXTENDED_MODE not set (skipping AI inference test)' : false,
      timeout: 30000,

      async run({ assert, Manager }) {
        // This test requires a real OPENAI_API_KEY and running Manager
        if (!process.env.OPENAI_API_KEY) {
          return assert.fail('OPENAI_API_KEY not set');
        }

        const assistant = Manager.Assistant();
        const result = await inferContact('john.smith@microsoft.com', assistant);

        assert.ok(result, 'Should return a result');
        assert.ok(result.firstName, 'Should infer a first name');
        assert.equal(result.method, 'ai', 'Should use AI method');
        assert.ok(typeof result.confidence === 'number', 'Confidence should be a number');
      },
    },
  ],
};
