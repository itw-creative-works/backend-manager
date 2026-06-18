/**
 * Test: cross-provider AI tools formatting (libraries/ai)
 *
 * Verifies the unified tools interface added for agentic tool loops:
 *   - anthropic-format.js — tool defs, tool choice, unified-message → Claude
 *     Messages API mapping (tool_use / tool_result blocks), stop reasons
 *   - openai.js formatMessages/normalizeToolEntry/normalizeToolChoice — the
 *     direct-messages path and Responses API tool envelopes
 *   - ai/index.js normalizeOptions — structured conversations are NOT
 *     string-flattened; system injections still apply
 *
 * All pure helpers — no network, no assistant.
 */
const format = require('../../src/manager/libraries/ai/providers/anthropic-format.js');
const OpenAI = require('../../src/manager/libraries/ai/providers/openai.js');
const AI = require('../../src/manager/libraries/ai/index.js');

const { formatMessages, normalizeToolEntry, normalizeToolChoice } = OpenAI._internals;
const { normalizeOptions, isStructuredMessages, SYSTEM_PROMPT_INJECTIONS } = AI._internals;

function noopLog() {}

const SAMPLE_TOOL = {
  name: 'check_order',
  description: 'Look up an order',
  parameters: { type: 'object', properties: { orderNumber: { type: 'string' } }, required: ['orderNumber'] },
};

module.exports = {
  description: 'AI cross-provider tools formatting',
  type: 'group',
  tests: [
    // ─── anthropic-format: tool definitions ───

    {
      name: 'anthropic-tool-defs-map-parameters-to-input-schema',
      async run({ assert }) {
        const defs = format.buildToolDefs([SAMPLE_TOOL]);

        assert.equal(defs.length, 1, 'one def');
        assert.equal(defs[0].name, 'check_order', 'name preserved');
        assert.equal(defs[0].description, 'Look up an order', 'description preserved');
        assert.deepEqual(defs[0].input_schema, SAMPLE_TOOL.parameters, 'parameters → input_schema');
      },
    },

    {
      name: 'anthropic-tool-defs-accept-explicit-function-type',
      async run({ assert }) {
        const defs = format.buildToolDefs([{ ...SAMPLE_TOOL, type: 'function' }]);

        assert.equal(defs[0].name, 'check_order', 'function-typed entry accepted');
      },
    },

    {
      name: 'anthropic-tool-defs-reject-hosted-tools',
      async run({ assert }) {
        let threw = false;

        try {
          format.buildToolDefs([{ type: 'web_search' }]);
        } catch (e) {
          threw = true;
        }

        assert.equal(threw, true, 'hosted tool types throw on Anthropic');
      },
    },

    {
      name: 'anthropic-tool-defs-empty-list-returns-empty',
      async run({ assert }) {
        assert.deepEqual(format.buildToolDefs(undefined), [], 'undefined → []');
        assert.deepEqual(format.buildToolDefs([]), [], '[] → []');
      },
    },

    // ─── anthropic-format: tool choice ───

    {
      name: 'anthropic-tool-choice-mapping',
      async run({ assert }) {
        assert.deepEqual(format.buildToolChoice('auto'), { type: 'auto' }, 'auto');
        assert.deepEqual(format.buildToolChoice('required'), { type: 'any' }, 'required → any');
        assert.deepEqual(format.buildToolChoice('none'), { type: 'none' }, 'none');
        assert.deepEqual(format.buildToolChoice({ name: 'check_order' }), { type: 'tool', name: 'check_order' }, 'specific tool');
        assert.equal(format.buildToolChoice(undefined), undefined, 'undefined passes through');
      },
    },

    // ─── anthropic-format: message building ───

    {
      name: 'anthropic-messages-assistant-toolcalls-become-tool-use-blocks',
      async run({ assert }) {
        const { system, messages } = format.buildMessages({
          messages: [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'check my order 123' },
            { role: 'assistant', content: 'Let me check.', toolCalls: [{ id: 'call_1', name: 'check_order', arguments: { orderNumber: '123' } }] },
          ],
        });

        assert.equal(system, 'sys', 'system extracted');
        assert.equal(messages.length, 2, 'user + assistant');

        const assistantTurn = messages[1];
        assert.equal(assistantTurn.role, 'assistant', 'assistant role');
        assert.equal(assistantTurn.content[0].type, 'text', 'text block first');
        assert.equal(assistantTurn.content[0].text, 'Let me check.', 'text content');
        assert.equal(assistantTurn.content[1].type, 'tool_use', 'tool_use block');
        assert.equal(assistantTurn.content[1].id, 'call_1', 'call id');
        assert.deepEqual(assistantTurn.content[1].input, { orderNumber: '123' }, 'arguments → input');
      },
    },

    {
      name: 'anthropic-messages-consecutive-tool-results-merge-into-one-user-turn',
      async run({ assert }) {
        const { messages } = format.buildMessages({
          messages: [
            { role: 'user', content: 'hi' },
            { role: 'assistant', toolCalls: [
              { id: 'call_1', name: 'a', arguments: {} },
              { id: 'call_2', name: 'b', arguments: {} },
            ] },
            { role: 'tool', toolCallId: 'call_1', content: 'result A' },
            { role: 'tool', toolCallId: 'call_2', content: 'result B' },
          ],
        });

        assert.equal(messages.length, 3, 'user + assistant + ONE merged tool-result user turn');

        const resultTurn = messages[2];
        assert.equal(resultTurn.role, 'user', 'tool results ride a user turn');
        assert.equal(resultTurn.content.length, 2, 'both results in one turn');
        assert.equal(resultTurn.content[0].type, 'tool_result', 'tool_result block');
        assert.equal(resultTurn.content[0].tool_use_id, 'call_1', 'first result id');
        assert.equal(resultTurn.content[1].tool_use_id, 'call_2', 'second result id');
      },
    },

    {
      name: 'anthropic-messages-developer-role-folds-into-system',
      async run({ assert }) {
        const { system, messages } = format.buildMessages({
          messages: [
            { role: 'system', content: 'platform' },
            { role: 'developer', content: 'operator' },
            { role: 'user', content: 'hi' },
          ],
        });

        assert.equal(system, 'platform\n\noperator', 'developer folded into system');
        assert.equal(messages.length, 1, 'only the user turn remains');
      },
    },

    {
      name: 'anthropic-messages-raw-block-arrays-pass-through',
      async run({ assert }) {
        const rawBlocks = [{ type: 'text', text: 'hello' }, { type: 'tool_use', id: 'x', name: 't', input: {} }];
        const { messages } = format.buildMessages({
          messages: [
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: rawBlocks },
          ],
        });

        assert.deepEqual(messages[1].content, rawBlocks, 'raw blocks untouched');
      },
    },

    {
      name: 'anthropic-messages-legacy-prompt-message-form-unchanged',
      async run({ assert }) {
        const { system, messages } = format.buildMessages({
          prompt: { content: 'sys prompt' },
          message: { content: 'user msg' },
        });

        assert.equal(system, 'sys prompt', 'system from prompt');
        assert.deepEqual(messages, [{ role: 'user', content: 'user msg' }], 'single user turn');
      },
    },

    // ─── anthropic-format: response extraction ───

    {
      name: 'anthropic-extract-tool-calls-and-stop-reasons',
      async run({ assert }) {
        const calls = format.extractToolCalls([
          { type: 'text', text: 'thinking...' },
          { type: 'tool_use', id: 'call_9', name: 'check_order', input: { orderNumber: '9' } },
        ]);

        assert.equal(calls.length, 1, 'one call');
        assert.deepEqual(calls[0], { id: 'call_9', name: 'check_order', arguments: { orderNumber: '9' } }, 'normalized shape');

        assert.equal(format.mapStopReason('tool_use'), 'tool_use', 'tool_use');
        assert.equal(format.mapStopReason('max_tokens'), 'max_tokens', 'max_tokens');
        assert.equal(format.mapStopReason('end_turn'), 'end', 'end_turn → end');
        assert.equal(format.mapStopReason('stop_sequence'), 'end', 'stop_sequence → end');
      },
    },

    // ─── openai: direct-messages path ───

    {
      name: 'openai-format-messages-maps-toolcalls-to-function-call-items',
      async run({ assert }) {
        const input = formatMessages([
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'check order 123' },
          { role: 'assistant', content: 'Checking.', toolCalls: [{ id: 'call_1', name: 'check_order', arguments: { orderNumber: '123' } }] },
          { role: 'tool', toolCallId: 'call_1', content: '{"status":"shipped"}' },
        ], noopLog);

        assert.equal(input.length, 5, 'system + user + assistant text + function_call + function_call_output');
        assert.equal(input[0].role, 'system', 'system turn');
        assert.equal(input[1].role, 'user', 'user turn');
        assert.equal(input[2].role, 'assistant', 'assistant text turn');
        assert.equal(input[2].content[0].type, 'output_text', 'assistant uses output_text');

        const callItem = input[3];
        assert.equal(callItem.type, 'function_call', 'function_call item');
        assert.equal(callItem.call_id, 'call_1', 'call id');
        assert.equal(callItem.name, 'check_order', 'name');
        assert.equal(callItem.arguments, JSON.stringify({ orderNumber: '123' }), 'arguments stringified');

        const outputItem = input[4];
        assert.equal(outputItem.type, 'function_call_output', 'function_call_output item');
        assert.equal(outputItem.call_id, 'call_1', 'output call id');
        assert.equal(outputItem.output, '{"status":"shipped"}', 'output string');
      },
    },

    {
      name: 'openai-format-messages-toolcall-turn-without-text-emits-no-message-item',
      async run({ assert }) {
        const input = formatMessages([
          { role: 'user', content: 'hi' },
          { role: 'assistant', toolCalls: [{ id: 'c1', name: 't', arguments: {} }] },
        ], noopLog);

        assert.equal(input.length, 2, 'user + function_call only');
        assert.equal(input[1].type, 'function_call', 'no empty assistant message item');
      },
    },

    // ─── openai: tool envelopes ───

    {
      name: 'openai-tool-entry-normalization',
      async run({ assert }) {
        const normalized = normalizeToolEntry(SAMPLE_TOOL);

        assert.equal(normalized.type, 'function', 'function envelope added');
        assert.equal(normalized.name, 'check_order', 'name preserved');
        assert.deepEqual(normalized.parameters, SAMPLE_TOOL.parameters, 'parameters preserved');

        const hosted = normalizeToolEntry({ type: 'web_search' });
        assert.deepEqual(hosted, { type: 'web_search' }, 'hosted tools pass verbatim');
      },
    },

    {
      name: 'openai-tool-choice-normalization',
      async run({ assert }) {
        assert.equal(normalizeToolChoice('auto'), 'auto', 'auto passes');
        assert.equal(normalizeToolChoice('required'), 'required', 'required passes');
        assert.equal(normalizeToolChoice('none'), 'none', 'none passes');
        assert.deepEqual(normalizeToolChoice({ name: 'check_order' }), { type: 'function', name: 'check_order' }, 'specific tool');
      },
    },

    // ─── index.js: normalizeOptions on structured conversations ───

    {
      name: 'structured-detection',
      async run({ assert }) {
        assert.equal(isStructuredMessages([{ role: 'user', content: 'hi' }]), false, 'plain text is not structured');
        assert.equal(isStructuredMessages([{ role: 'tool', toolCallId: 'x', content: 'r' }]), true, 'tool turn is structured');
        assert.equal(isStructuredMessages([{ role: 'assistant', toolCalls: [{ id: 'x', name: 't' }] }]), true, 'toolCalls turn is structured');
        assert.equal(isStructuredMessages([{ role: 'assistant', content: [{ type: 'tool_use', id: 'x' }] }]), true, 'raw tool_use blocks are structured');
      },
    },

    {
      name: 'normalize-options-structured-keeps-turns-and-injects-system-rules',
      async run({ assert }) {
        const messages = [
          { role: 'system', content: 'agent instructions' },
          { role: 'user', content: 'check order 1' },
          { role: 'assistant', toolCalls: [{ id: 'c1', name: 'check_order', arguments: {} }] },
          { role: 'tool', toolCallId: 'c1', content: 'shipped' },
        ];
        const out = normalizeOptions({ messages });

        assert.equal(out.messages.length, 4, 'no turns added or dropped');
        assert.equal(
          out.messages[0].content.includes(SYSTEM_PROMPT_INJECTIONS[0]),
          true,
          'system rules injected into the system turn',
        );
        assert.equal(
          out.messages[0].content.includes('agent instructions'),
          true,
          'original system content preserved',
        );
        assert.deepEqual(out.messages[2], messages[2], 'toolCalls turn untouched');
        assert.deepEqual(out.messages[3], messages[3], 'tool result turn untouched');
        assert.equal(out.prompt, undefined, 'prompt NOT synthesized in structured mode');
      },
    },

    {
      name: 'normalize-options-structured-without-system-prepends-rules-turn',
      async run({ assert }) {
        const out = normalizeOptions({
          messages: [
            { role: 'user', content: 'hi' },
            { role: 'tool', toolCallId: 'c1', content: 'r' },
          ],
        });

        assert.equal(out.messages.length, 3, 'rules turn prepended');
        assert.equal(out.messages[0].role, 'system', 'first turn is system');
        assert.equal(out.messages[0].content.includes(SYSTEM_PROMPT_INJECTIONS[1]), true, 'rules content');
      },
    },

    {
      name: 'normalize-options-legacy-plain-messages-unchanged-behavior',
      async run({ assert }) {
        const out = normalizeOptions({
          messages: [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'hello' },
          ],
        });

        assert.equal(typeof out.prompt?.content, 'string', 'prompt synthesized for legacy mode');
        assert.equal(out.prompt.content.includes('sys'), true, 'prompt carries system content');
        assert.equal(out.message?.content, 'hello', 'message carries last user turn');
      },
    },

    {
      name: 'normalize-options-structured-system-content-as-array-injects-rules',
      async run({ assert }) {
        const messages = [
          {
            role: 'system',
            content: [
              { type: 'text', text: 'existing instruction' },
              { type: 'image', source: { type: 'url', url: 'https://example.com/img.png' } },
            ],
          },
          { role: 'user', content: 'check order 1' },
          { role: 'assistant', toolCalls: [{ id: 'c1', name: 'check_order', arguments: {} }] },
          { role: 'tool', toolCallId: 'c1', content: 'shipped' },
        ];
        const out = normalizeOptions({ messages });

        assert.equal(out.messages.length, 4, 'no turns added or dropped');
        assert.equal(Array.isArray(out.messages[0].content), true, 'system content stays as array');
        assert.equal(out.messages[0].content[0].type, 'text', 'rules prepended as text block');
        assert.equal(
          out.messages[0].content[0].text.includes(SYSTEM_PROMPT_INJECTIONS[0]),
          true,
          'system rules injected into prepended text block',
        );
        assert.equal(out.messages[0].content[1].type, 'text', 'original text block preserved');
        assert.equal(out.messages[0].content[1].text, 'existing instruction', 'original text content intact');
        assert.equal(out.messages[0].content[2].type, 'image', 'original image block preserved');
        assert.deepEqual(out.messages[2], messages[2], 'toolCalls turn untouched');
        assert.deepEqual(out.messages[3], messages[3], 'tool result turn untouched');
      },
    },
  ],
};
