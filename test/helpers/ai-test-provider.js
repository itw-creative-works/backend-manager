/**
 * Test: deterministic AI test provider (libraries/ai/providers/test.js)
 *
 * The test provider is a first-class provider (the `test` payment-processor
 * precedent) that consumer suites drive with directives embedded in the last
 * user message. These tests exercise the full request() surface directly —
 * no network involved by design.
 */
const TestProvider = require('../../src/manager/libraries/ai/providers/test.js');
const { parseScript } = TestProvider._internals;

function makeProvider() {
  // No Manager — the provider falls back to the BEM_TESTING signal, which the
  // test runner sets
  return new TestProvider({});
}

module.exports = {
  description: 'AI test provider (scripted sequences)',
  type: 'group',
  tests: [
    // ─── Script parsing ───

    {
      name: 'parse-script-orders-steps-and-strips-directives',
      async run({ assert }) {
        const { steps, cleanText } = parseScript(
          'Check my order [[tool:check_order {"orderNumber":"1"}]] please [[reply:{"message":"done"}]]',
        );

        assert.equal(steps.length, 2, 'two steps');
        assert.equal(steps[0].type, 'tools', 'first step is a tool call');
        assert.equal(steps[0].calls[0].name, 'check_order', 'tool name parsed');
        assert.deepEqual(steps[0].calls[0].arguments, { orderNumber: '1' }, 'tool args parsed');
        assert.equal(steps[1].type, 'reply', 'second step is the reply');
        assert.equal(cleanText, 'Check my order  please', 'directives stripped from echo text');
      },
    },

    {
      name: 'parse-script-delay-attaches-to-next-step',
      async run({ assert }) {
        const { steps } = parseScript('[[delay:50]][[tool:slow_tool]]');

        assert.equal(steps.length, 1, 'one step');
        assert.equal(steps[0].delay, 50, 'delay attached to the tool step');
      },
    },

    // ─── Echo default ───

    {
      name: 'echo-reply-without-directives',
      async run({ assert }) {
        const provider = makeProvider();
        const result = await provider.request({
          messages: [
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'hello there' },
          ],
        });

        assert.equal(result.content, 'Echo: hello there', 'echoes the user message');
        assert.equal(result.stopReason, 'end', 'final turn');
        assert.deepEqual(result.toolCalls, [], 'no tool calls');
        assert.equal(result.tokens.total.count > 0, true, 'tokens accounted');
      },
    },

    {
      name: 'echo-reply-json-mode-wraps-message',
      async run({ assert }) {
        const provider = makeProvider();
        const result = await provider.request({
          response: 'json',
          messages: [{ role: 'user', content: 'hi' }],
        });

        assert.equal(typeof result.content, 'object', 'parsed object');
        assert.equal(result.content.message, 'Echo: hi', 'wrapped message');
      },
    },

    // ─── Scripted reply ───

    {
      name: 'scripted-json-reply',
      async run({ assert }) {
        const provider = makeProvider();
        const result = await provider.request({
          response: 'json',
          messages: [
            { role: 'user', content: 'whatever [[reply:{"message":"Hi!","actions":[{"type":"reply","label":"More"}]}]]' },
          ],
        });

        assert.equal(result.content.message, 'Hi!', 'scripted message');
        assert.equal(result.content.actions[0].label, 'More', 'scripted actions');
        assert.equal(result.stopReason, 'end', 'final turn');
      },
    },

    // ─── Tool loop sequence ───

    {
      name: 'tool-then-reply-sequence-across-turns',
      async run({ assert }) {
        const provider = makeProvider();
        const script = 'check it [[tool:check_order {"orderNumber":"42"}]] [[reply:{"message":"Order 42 shipped"}]]';

        // Turn 1: the provider emits the tool call
        const first = await provider.request({
          response: 'json',
          messages: [
            { role: 'system', content: 'sys' },
            { role: 'user', content: script },
          ],
        });

        assert.equal(first.stopReason, 'tool_use', 'first turn requests the tool');
        assert.equal(first.toolCalls.length, 1, 'one call');
        assert.equal(first.toolCalls[0].name, 'check_order', 'tool name');
        assert.deepEqual(first.toolCalls[0].arguments, { orderNumber: '42' }, 'tool args');

        // Turn 2: caller appended the assistant turn + tool result — provider
        // moves to the next step (the reply)
        const second = await provider.request({
          response: 'json',
          messages: [
            { role: 'system', content: 'sys' },
            { role: 'user', content: script },
            { role: 'assistant', toolCalls: first.toolCalls },
            { role: 'tool', toolCallId: first.toolCalls[0].id, content: '{"status":"shipped"}' },
          ],
        });

        assert.equal(second.stopReason, 'end', 'second turn is final');
        assert.equal(second.content.message, 'Order 42 shipped', 'scripted final reply');
      },
    },

    {
      name: 'parallel-tools-directive-emits-multiple-calls',
      async run({ assert }) {
        const provider = makeProvider();
        const result = await provider.request({
          messages: [
            { role: 'user', content: '[[tools:[{"name":"a","arguments":{"x":1}},{"name":"b","arguments":{"y":2}}]]]' },
          ],
        });

        assert.equal(result.stopReason, 'tool_use', 'tool turn');
        assert.equal(result.toolCalls.length, 2, 'two parallel calls');
        assert.equal(result.toolCalls[0].name, 'a', 'first call');
        assert.equal(result.toolCalls[1].name, 'b', 'second call');
        assert.deepEqual(result.toolCalls[1].arguments, { y: 2 }, 'second args');
      },
    },

    // ─── Scripted error ───

    {
      name: 'scripted-error-throws',
      async run({ assert }) {
        const provider = makeProvider();
        let threw = false;

        try {
          await provider.request({
            messages: [{ role: 'user', content: '[[error:boom]]' }],
          });
        } catch (e) {
          threw = true;
          assert.equal(e.message, 'boom', 'scripted error message');
        }

        assert.equal(threw, true, 'throws the scripted error');
      },
    },

    // ─── Script exhaustion ───

    {
      name: 'exhausted-script-falls-back-to-echo',
      async run({ assert }) {
        const provider = makeProvider();
        const script = 'hi [[tool:t1]]';

        const second = await provider.request({
          messages: [
            { role: 'user', content: script },
            { role: 'assistant', toolCalls: [{ id: 'c', name: 't1', arguments: {} }] },
            { role: 'tool', toolCallId: 'c', content: 'r' },
          ],
        });

        assert.equal(second.stopReason, 'end', 'falls back to a final turn');
        assert.equal(String(second.content).startsWith('Echo:'), true, 'echo fallback');
      },
    },
  ],
};
