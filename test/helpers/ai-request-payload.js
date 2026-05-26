/**
 * Test: AI request payload shape (libraries/ai/providers/openai.js)
 *
 * Verifies the transformation from the BEM-facing `ai.request()` options
 * (specifically `options.prompt` in either legacy object form or array form)
 * into the eventual OpenAI HTTP payload (the `input: [...]` array).
 *
 * These tests exercise the pure helpers `normalizePrompt` and `formatHistory`
 * directly — no network, no assistant required.
 */
const OpenAI = require('../../src/manager/libraries/ai/providers/openai.js');
const { normalizePrompt, formatHistory, VALID_PROMPT_ROLES } = OpenAI._internals;

function noopLog() {}

function baseOptions(overrides = {}) {
  return {
    dedupeConsecutiveRoles: true,
    history: { messages: [], limit: 5 },
    message: { attachments: [] },
    ...overrides,
  };
}

module.exports = {
  description: 'AI request payload shape (system/developer/user roles)',
  type: 'group',
  tests: [
    // ─── normalizePrompt ───

    {
      name: 'normalize-undefined-returns-empty-array',
      async run({ assert }) {
        assert.deepEqual(normalizePrompt(undefined), [], 'undefined → []');
      },
    },

    {
      name: 'normalize-null-returns-empty-array',
      async run({ assert }) {
        assert.deepEqual(normalizePrompt(null), [], 'null → []');
      },
    },

    {
      name: 'normalize-empty-object-returns-empty-array',
      async run({ assert }) {
        assert.deepEqual(normalizePrompt({}), [], 'empty object → []');
      },
    },

    {
      name: 'normalize-legacy-object-form-wraps-as-system-segment',
      async run({ assert }) {
        const result = normalizePrompt({ path: '/tmp/example.md', settings: { foo: 'bar' } });

        assert.equal(result.length, 1, 'one segment');
        assert.equal(result[0].role, 'system', 'legacy object defaults to system role');
        assert.equal(result[0].path, '/tmp/example.md', 'path preserved');
        assert.deepEqual(result[0].settings, { foo: 'bar' }, 'settings preserved');
      },
    },

    {
      name: 'normalize-legacy-object-with-content-only',
      async run({ assert }) {
        const result = normalizePrompt({ content: 'inline prompt text' });

        assert.equal(result.length, 1, 'one segment');
        assert.equal(result[0].role, 'system', 'defaults to system');
        assert.equal(result[0].content, 'inline prompt text', 'content preserved');
        assert.equal(result[0].path, '', 'no path');
      },
    },

    {
      name: 'normalize-array-form-preserves-roles-and-order',
      async run({ assert }) {
        const result = normalizePrompt([
          { role: 'system',    content: 'platform rules' },
          { role: 'developer', content: 'operator config' },
        ]);

        assert.equal(result.length, 2, 'two segments');
        assert.equal(result[0].role, 'system', 'first is system');
        assert.equal(result[0].content, 'platform rules', 'first content');
        assert.equal(result[1].role, 'developer', 'second is developer');
        assert.equal(result[1].content, 'operator config', 'second content');
      },
    },

    {
      name: 'normalize-array-segment-without-role-defaults-to-system',
      async run({ assert }) {
        const result = normalizePrompt([
          { content: 'rule 1' },
          { role: 'developer', content: 'rule 2' },
        ]);

        assert.equal(result[0].role, 'system', 'missing role → system');
        assert.equal(result[1].role, 'developer', 'explicit role preserved');
      },
    },

    {
      name: 'normalize-array-with-invalid-role-throws',
      async run({ assert }) {
        let threw = false;
        try {
          normalizePrompt([{ role: 'admin', content: 'bad' }]);
        } catch (e) {
          threw = true;
          assert.equal(
            String(e.message).includes('Invalid prompt role'),
            true,
            'error mentions Invalid prompt role',
          );
        }
        assert.equal(threw, true, 'should throw on invalid role');
      },
    },

    {
      name: 'normalize-valid-roles-set-matches-openai-model-spec',
      async run({ assert }) {
        const expected = ['system', 'developer', 'user', 'assistant'];
        const actual = [...VALID_PROMPT_ROLES].sort();

        assert.deepEqual(actual, expected.sort(), 'valid roles per OpenAI Model Spec');
      },
    },

    {
      name: 'normalize-all-valid-roles-accepted',
      async run({ assert }) {
        const segments = ['system', 'developer', 'user', 'assistant'].map((role) => ({
          role,
          content: `content for ${role}`,
        }));

        const result = normalizePrompt(segments);

        assert.equal(result.length, 4, 'all four segments accepted');
        result.forEach((segment, i) => {
          assert.equal(segment.role, segments[i].role, `segment ${i} role preserved`);
        });
      },
    },

    // ─── formatHistory → OpenAI Responses API payload shape ───

    {
      name: 'format-single-system-prompt-emits-system-then-user',
      async run({ assert }) {
        const promptSegments = normalizePrompt({ content: 'You are a helpful assistant.' });
        const formatted = formatHistory(baseOptions(), promptSegments, 'Hello!', noopLog);

        assert.equal(formatted.length, 2, 'two messages: system + user');
        assert.equal(formatted[0].role, 'system', 'first message is system');
        assert.equal(formatted[0].content[0].type, 'input_text', 'system uses input_text');
        assert.equal(formatted[0].content[0].text, 'You are a helpful assistant.', 'system text');
        assert.equal(formatted[1].role, 'user', 'second message is user');
        assert.equal(formatted[1].content[0].text, 'Hello!', 'user text');
      },
    },

    {
      name: 'format-system-plus-developer-emits-three-messages-in-order',
      async run({ assert }) {
        const promptSegments = normalizePrompt([
          { role: 'system',    content: 'Platform rules go here.' },
          { role: 'developer', content: 'Operator config goes here.' },
        ]);
        const formatted = formatHistory(baseOptions(), promptSegments, 'Customer email body.', noopLog);

        assert.equal(formatted.length, 3, 'three messages');
        assert.equal(formatted[0].role, 'system', 'order: system');
        assert.equal(formatted[1].role, 'developer', 'order: developer');
        assert.equal(formatted[2].role, 'user', 'order: user');
        assert.equal(formatted[0].content[0].text, 'Platform rules go here.', 'system content');
        assert.equal(formatted[1].content[0].text, 'Operator config goes here.', 'developer content');
        assert.equal(formatted[2].content[0].text, 'Customer email body.', 'user content');
      },
    },

    {
      name: 'format-empty-prompt-array-emits-only-user-message',
      async run({ assert }) {
        const formatted = formatHistory(baseOptions(), [], 'Just a user message.', noopLog);

        assert.equal(formatted.length, 1, 'only the user message');
        assert.equal(formatted[0].role, 'user', 'role: user');
        assert.equal(formatted[0].content[0].text, 'Just a user message.', 'text preserved');
      },
    },

    {
      name: 'format-interleaves-prompt-history-and-new-user-message',
      async run({ assert }) {
        const promptSegments = normalizePrompt([
          { role: 'system',    content: 'system rules' },
          { role: 'developer', content: 'developer rules' },
        ]);
        const options = baseOptions({
          history: {
            messages: [
              { role: 'user',      content: 'first user msg' },
              { role: 'assistant', content: 'first ai reply' },
            ],
            limit: 5,
          },
        });
        const formatted = formatHistory(options, promptSegments, 'second user msg', noopLog);

        const roleSequence = formatted.map((m) => m.role);
        assert.deepEqual(
          roleSequence,
          ['system', 'developer', 'user', 'assistant', 'user'],
          'prompts → history → new user message',
        );
      },
    },

    {
      name: 'format-assistant-history-uses-output_text-type',
      async run({ assert }) {
        const options = baseOptions({
          history: {
            messages: [{ role: 'assistant', content: 'previous reply' }],
            limit: 5,
          },
        });
        const formatted = formatHistory(options, [], 'new message', noopLog);

        const assistantMsg = formatted.find((m) => m.role === 'assistant');
        assert.equal(assistantMsg.content[0].type, 'output_text', 'assistant uses output_text');
      },
    },

    {
      name: 'format-respects-history-limit',
      async run({ assert }) {
        const options = baseOptions({
          history: {
            messages: [
              { role: 'user',      content: 'msg 1' },
              { role: 'assistant', content: 'msg 2' },
              { role: 'user',      content: 'msg 3' },
              { role: 'assistant', content: 'msg 4' },
              { role: 'user',      content: 'msg 5' },
              { role: 'assistant', content: 'msg 6' },
            ],
            limit: 2,
          },
        });
        const formatted = formatHistory(options, normalizePrompt({ content: 'sys' }), 'now', noopLog);

        // Expected: 1 system + 2 history + 1 user = 4 messages
        assert.equal(formatted.length, 4, 'system + 2 history + new user');
        assert.equal(formatted[1].content[0].text, 'msg 5', 'second-to-last history kept');
        assert.equal(formatted[2].content[0].text, 'msg 6', 'last history kept');
        assert.equal(formatted[3].content[0].text, 'now', 'new user message appended');
      },
    },

    {
      name: 'format-dedupes-trailing-user-history-when-flag-set',
      async run({ assert }) {
        const options = baseOptions({
          dedupeConsecutiveRoles: true,
          history: {
            messages: [
              { role: 'assistant', content: 'reply' },
              { role: 'user',      content: 'should be dropped' },
            ],
            limit: 5,
          },
        });
        const formatted = formatHistory(options, [], 'real new message', noopLog);

        // history's trailing 'user' is dropped, then the real new message is appended
        assert.equal(formatted.length, 2, 'assistant + new user only');
        assert.equal(formatted[0].role, 'assistant', 'kept assistant');
        assert.equal(formatted[1].role, 'user', 'new user');
        assert.equal(formatted[1].content[0].text, 'real new message', 'new user content');
      },
    },

    {
      name: 'format-strips-and-trims-content',
      async run({ assert }) {
        const promptSegments = normalizePrompt({ content: '  padded system content  \n' });
        const formatted = formatHistory(baseOptions(), promptSegments, '  padded user content  ', noopLog);

        assert.equal(formatted[0].content[0].text, 'padded system content', 'system trimmed');
        assert.equal(formatted[1].content[0].text, 'padded user content', 'user trimmed');
      },
    },
  ],
};
