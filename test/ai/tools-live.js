/**
 * Test: live cross-provider tool loops (libraries/ai)
 *
 * EXTENDED MODE ONLY — drives a real 2-step tool loop (tool call → tool result
 * → final answer) against the live Anthropic and OpenAI APIs to prove the
 * normalized tools interface end-to-end. Costs real API credits; uses the
 * cheapest models.
 *
 * Requires BACKEND_MANAGER_ANTHROPIC_API_KEY / BACKEND_MANAGER_OPENAI_API_KEY
 * in the runner environment.
 */
const Anthropic = require('../../src/manager/libraries/ai/providers/anthropic.js');
const OpenAI = require('../../src/manager/libraries/ai/providers/openai.js');

const WEATHER_TOOL = {
  name: 'get_weather',
  description: 'Get the current weather for a city. ALWAYS use this tool when asked about weather.',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
    },
    required: ['city'],
  },
};

const SYSTEM = 'You are a weather assistant. Use the get_weather tool to answer weather questions, then summarize the result in one sentence.';
const QUESTION = 'What is the weather in Paris right now?';
const TOOL_RESULT = '{"temperature":"21C","conditions":"sunny"}';

// Minimal assistant context for direct provider construction — live tests
// bypass Manager.AI() to pin provider behavior precisely
function directAssistant() {
  return {
    log: () => {},
    error: () => {},
    errorify: (message) => new Error(message),
    getUser: () => ({ auth: { uid: 'bem-ai-live-test' } }),
    request: { geolocation: { ip: '127.0.0.1' } },
  };
}

function skipReason(keys) {
  if (!process.env.TEST_EXTENDED_MODE) {
    return 'TEST_EXTENDED_MODE not set (live AI tool-loop test)';
  }

  if (!keys.some((key) => process.env[key])) {
    return `${keys[0]} not set in the runner environment`;
  }

  return false;
}

module.exports = {
  description: 'Live AI tool loops (anthropic + openai)',
  type: 'group',
  tests: [
    {
      name: 'anthropic-two-step-tool-loop',
      timeout: 120000,
      skip: skipReason(['BACKEND_MANAGER_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY']),

      async run({ assert }) {
        const provider = new Anthropic(directAssistant());

        const base = [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: QUESTION },
        ];

        // Step 1 — the model must call the tool
        const first = await provider.request({
          model: 'claude-haiku-4-5',
          maxTokens: 1024,
          messages: base,
          tools: { list: [WEATHER_TOOL], choice: 'required' },
        });

        assert.equal(first.stopReason, 'tool_use', 'first turn stops for tool use');
        assert.equal(first.toolCalls.length >= 1, true, 'at least one tool call');
        assert.equal(first.toolCalls[0].name, 'get_weather', 'called the weather tool');
        assert.equal(
          String(first.toolCalls[0].arguments.city || '').toLowerCase().includes('paris'),
          true,
          'extracted the city',
        );

        // Step 2 — replay the raw assistant blocks + tool result, get the answer
        const second = await provider.request({
          model: 'claude-haiku-4-5',
          maxTokens: 1024,
          messages: [
            ...base,
            { role: 'assistant', content: first.raw.content },
            { role: 'tool', toolCallId: first.toolCalls[0].id, content: TOOL_RESULT },
          ],
          tools: { list: [WEATHER_TOOL] },
        });

        assert.equal(second.stopReason, 'end', 'second turn is final');
        assert.equal(second.toolCalls.length, 0, 'no further tool calls');

        const answer = String(second.content).toLowerCase();
        assert.equal(
          answer.includes('21') || answer.includes('sunny'),
          true,
          `final answer uses the tool result (got: ${String(second.content).slice(0, 200)})`,
        );
        assert.equal(second.tokens.total.count > 0, true, 'tokens accounted');
      },
    },

    {
      name: 'openai-two-step-tool-loop',
      timeout: 120000,
      skip: skipReason(['BACKEND_MANAGER_OPENAI_API_KEY', 'OPENAI_API_KEY']),

      async run({ assert }) {
        const provider = new OpenAI(directAssistant());

        const base = [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: QUESTION },
        ];

        // Step 1 — the model must call the tool
        const first = await provider.request({
          model: 'gpt-5-nano',
          maxTokens: 2048,
          moderate: false,
          messages: base,
          tools: { list: [WEATHER_TOOL], choice: 'required' },
        });

        assert.equal(first.stopReason, 'tool_use', 'first turn stops for tool use');
        assert.equal(first.toolCalls.length >= 1, true, 'at least one tool call');
        assert.equal(first.toolCalls[0].name, 'get_weather', 'called the weather tool');
        assert.equal(
          String(first.toolCalls[0].arguments.city || '').toLowerCase().includes('paris'),
          true,
          'extracted the city',
        );

        // Step 2 — replay normalized toolCalls + tool result, get the answer
        const second = await provider.request({
          model: 'gpt-5-nano',
          maxTokens: 2048,
          moderate: false,
          messages: [
            ...base,
            { role: 'assistant', toolCalls: first.toolCalls },
            { role: 'tool', toolCallId: first.toolCalls[0].id, content: TOOL_RESULT },
          ],
          tools: { list: [WEATHER_TOOL] },
        });

        assert.equal(second.stopReason, 'end', 'second turn is final');
        assert.equal(second.toolCalls.length, 0, 'no further tool calls');

        const answer = String(second.content).toLowerCase();
        assert.equal(
          answer.includes('21') || answer.includes('sunny'),
          true,
          `final answer uses the tool result (got: ${String(second.content).slice(0, 200)})`,
        );
      },
    },
  ],
};
