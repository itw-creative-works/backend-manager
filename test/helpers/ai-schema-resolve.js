/**
 * Test: AI schema resolution (libraries/ai/providers/openai.js)
 *
 * Verifies resolveSchema() — loading JSON Schema from inline objects or file paths.
 */
const path = require('path');
const jetpack = require('fs-jetpack');
const OpenAI = require('../../src/manager/libraries/ai/providers/openai.js');
const { resolveSchema } = OpenAI._internals;

function noopLog() {}

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'ai-schema');
const VALID_SCHEMA_PATH = path.join(FIXTURES_DIR, 'valid.json');
const INVALID_SCHEMA_PATH = path.join(FIXTURES_DIR, 'invalid.json');
const VALID_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'The name' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'tags'],
  additionalProperties: false,
};

// The runner has no before/after hooks (module contract: tests[] + cleanup),
// so each test that reads from disk seeds the fixtures itself (idempotent).
function ensureFixtures() {
  jetpack.write(VALID_SCHEMA_PATH, VALID_SCHEMA);
  jetpack.write(INVALID_SCHEMA_PATH, '{ not valid json !!!');
}

module.exports = {
  description: 'AI schema resolution (inline vs file path)',
  type: 'group',

  tests: [
    {
      name: 'undefined-returns-undefined',
      async run({ assert }) {
        assert.equal(resolveSchema(undefined, noopLog), undefined, 'undefined → undefined');
      },
    },

    {
      name: 'null-returns-undefined',
      async run({ assert }) {
        assert.equal(resolveSchema(null, noopLog), undefined, 'null → undefined');
      },
    },

    {
      name: 'false-returns-undefined',
      async run({ assert }) {
        assert.equal(resolveSchema(false, noopLog), undefined, 'false → undefined');
      },
    },

    {
      name: 'inline-object-returned-as-is',
      async run({ assert }) {
        const inline = { type: 'object', properties: { x: { type: 'string' } } };
        const result = resolveSchema(inline, noopLog);
        assert.deepEqual(result, inline, 'inline schema passed through unchanged');
      },
    },

    {
      name: 'path-loads-json-file',
      async run({ assert }) {
        ensureFixtures();
        const result = resolveSchema({ path: VALID_SCHEMA_PATH }, noopLog);
        assert.deepEqual(result, VALID_SCHEMA, 'loaded schema matches fixture');
      },
    },

    {
      name: 'path-not-found-throws',
      async run({ assert }) {
        let threw = false;
        try {
          resolveSchema({ path: '/nonexistent/schema.json' }, noopLog);
        } catch (e) {
          threw = true;
          assert.equal(e.message.includes('not found'), true, 'error mentions not found');
        }
        assert.equal(threw, true, 'should throw on missing file');
      },
    },

    {
      name: 'path-to-directory-throws',
      async run({ assert }) {
        ensureFixtures();
        let threw = false;
        try {
          resolveSchema({ path: FIXTURES_DIR }, noopLog);
        } catch (e) {
          threw = true;
          assert.equal(e.message.includes('is a directory'), true, 'error mentions directory');
        }
        assert.equal(threw, true, 'should throw on directory path');
      },
    },

    {
      name: 'invalid-json-throws',
      async run({ assert }) {
        ensureFixtures();
        let threw = false;
        try {
          resolveSchema({ path: INVALID_SCHEMA_PATH }, noopLog);
        } catch (e) {
          threw = true;
        }
        assert.equal(threw, true, 'should throw on invalid JSON');
      },
    },
  ],

  async cleanup() {
    jetpack.remove(FIXTURES_DIR);
  },
};
