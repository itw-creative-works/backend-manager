/**
 * Test provider — a deterministic, first-class AI provider for test suites
 * (the `test` payment-processor precedent: a real implementation of the
 * provider seam, not a mock injected into callers).
 *
 * REFUSES to run in production — only development/testing environments.
 *
 * Behavior is scripted by directives embedded in the LAST user message. The
 * directives form a SEQUENCE consumed across the turns of a tool loop: call N
 * executes directive N-1 (indexed by how many assistant turns follow the last
 * user turn in options.messages). Directive content must not contain `]]`.
 *
 *   [[tool:check_order {"orderNumber":"123"}]]   — one tool call this step
 *   [[tools:[{"name":"a","arguments":{}},{"name":"b","arguments":{}}]]
 *                                                 — parallel tool calls this step
 *   [[reply:{"message":"done"}]]                  — final reply (JSON or text)
 *   [[delay:500]]                                 — modifier: delay the NEXT step
 *   [[error:boom]]                                — throw at this step
 *
 * No directives (or script exhausted) → echo reply: `Echo: <text>` (wrapped as
 * { message } when options.response === 'json').
 *
 * Returns the same shape as the real providers:
 *   { content, output, tokens, raw, toolCalls, stopReason }
 */
const JSON5 = require('json5');

// The closing `]]` must not be followed by another `]` so directive values may
// END with a JSON `]` (e.g. [[tools:[...]]]); `]]` strictly INSIDE a value is
// still unsupported
const DIRECTIVE_REGEX = /\[\[(tool|tools|reply|delay|error)(?::([\s\S]*?))?\]\](?!\])/g;

function TestProvider(assistant, key) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant?.Manager;
  self.key = key || 'test';

  self.tokens = {
    total:  { count: 0, price: 0 },
    input:  { count: 0, price: 0 },
    output: { count: 0, price: 0 },
  };

  return self;
}

TestProvider.prototype.request = async function (options) {
  const self = this;

  assertAllowedEnvironment(self.Manager);

  options = options || {};

  const messages = Array.isArray(options.messages) ? options.messages : [];
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user' && typeof m.content === 'string');
  const scriptSource = lastUserMessage?.content || stringifyLoose(options.message?.content) || '';

  const { steps, cleanText } = parseScript(scriptSource);

  // Which step of the script is this call? One assistant turn is appended per
  // loop iteration, so call N sees N-1 assistant turns after the last user turn.
  const lastUserIdx = messages.lastIndexOf(lastUserMessage);
  const stepIndex = messages.slice(lastUserIdx + 1).filter((m) => m.role === 'assistant').length;

  const step = steps[stepIndex] || { type: 'echo' };

  // Simulated token accounting so usage/cost paths execute
  const inputChars = messages.reduce((n, m) => n + stringifyLoose(m.content).length, 0) || scriptSource.length;
  self.tokens.input.count += Math.ceil(inputChars / 4);

  if (step.delay) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(step.delay, 30000)));
  }

  if (step.type === 'error') {
    throw new Error(step.message || 'Test provider scripted error');
  }

  if (step.type === 'tools') {
    const toolCalls = step.calls.map((call, i) => ({
      id: `call_test_${stepIndex}_${i}`,
      name: call.name,
      arguments: call.arguments || {},
    }));

    self.tokens.output.count += 10 * toolCalls.length;
    finalizeTokens(self.tokens);

    return {
      content: '',
      output: [],
      tokens: self.tokens,
      raw: { provider: 'test', step: stepIndex, toolCalls },
      toolCalls,
      stopReason: 'tool_use',
    };
  }

  // Final reply — scripted or echo
  let text;

  if (step.type === 'reply') {
    text = step.content;
  } else {
    text = `Echo: ${cleanText || '(empty)'}`;

    if (options.response === 'json') {
      text = JSON.stringify({ message: text });
    }
  }

  self.tokens.output.count += Math.ceil(text.length / 4);
  finalizeTokens(self.tokens);

  let parsed = text;

  if (options.response === 'json') {
    try {
      parsed = JSON5.parse(text);
    } catch (e) {
      // Loose by design — a scripted plain-text reply stays a string
    }
  }

  return {
    content: parsed,
    output: [{ type: 'text', text }],
    tokens: self.tokens,
    raw: { provider: 'test', step: stepIndex },
    toolCalls: [],
    stopReason: 'end',
  };
};

/**
 * Parse the directive script out of a message. Returns the ordered steps and
 * the message text with directives stripped (the echo source).
 */
function parseScript(rawSource) {
  // Consumers may markdown-escape user input before it reaches the provider
  // (\[\[tool:...\]\]) — unescape so directives still parse
  const source = String(rawSource || '').replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, '$1');

  const steps = [];
  let pendingDelay = 0;
  let match;

  DIRECTIVE_REGEX.lastIndex = 0;

  while ((match = DIRECTIVE_REGEX.exec(source)) !== null) {
    const [, type, value] = match;

    if (type === 'delay') {
      pendingDelay = parseInt(value, 10) || 0;
      continue;
    }

    const step = buildStep(type, value);
    step.delay = pendingDelay;
    pendingDelay = 0;

    steps.push(step);
  }

  // Trailing delay with no following directive → delay the default echo
  if (pendingDelay) {
    steps.push({ type: 'echo', delay: pendingDelay });
  }

  const cleanText = source.replace(DIRECTIVE_REGEX, '').trim();

  return { steps, cleanText };
}

function buildStep(type, value) {
  if (type === 'error') {
    return { type: 'error', message: (value || '').trim() };
  }

  if (type === 'reply') {
    return { type: 'reply', content: (value || '').trim() };
  }

  if (type === 'tools') {
    return { type: 'tools', calls: JSON5.parse(value) };
  }

  // tool:name {json}
  const trimmed = (value || '').trim();
  const spaceIdx = trimmed.search(/\s/);
  const name = spaceIdx < 0 ? trimmed : trimmed.slice(0, spaceIdx);
  const argsRaw = spaceIdx < 0 ? '' : trimmed.slice(spaceIdx).trim();

  return {
    type: 'tools',
    calls: [{ name, arguments: argsRaw ? JSON5.parse(argsRaw) : {} }],
  };
}

function assertAllowedEnvironment(Manager) {
  // The Manager's environment detection is the SSOT when in scope
  if (Manager && typeof Manager.isDevelopment === 'function' && typeof Manager.isTesting === 'function') {
    if (Manager.isDevelopment() || Manager.isTesting()) {
      return;
    }

    throw new Error('AI test provider is only available in development or testing environments');
  }

  // No Manager (pure unit tests) — allow only under explicit test/emulator signals
  if (process.env.BEM_TESTING === 'true' || process.env.FUNCTIONS_EMULATOR) {
    return;
  }

  throw new Error('AI test provider is only available in development or testing environments');
}

function finalizeTokens(tokens) {
  tokens.total.count = tokens.input.count + tokens.output.count;
}

function stringifyLoose(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((c) => c?.text || '').join('\n');
  }

  return content ? String(content) : '';
}

module.exports = TestProvider;

// Exposed for unit tests. Not part of the public API.
module.exports._internals = {
  parseScript,
  buildStep,
};
