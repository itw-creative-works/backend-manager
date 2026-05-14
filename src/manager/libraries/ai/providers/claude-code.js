/**
 * Claude Code provider — uses @anthropic-ai/claude-agent-sdk to call Claude via
 * the local user's Claude Code subscription (no API key, no Anthropic credits).
 *
 * Pass `forceLoginMethod: 'claudeai'` so the SDK auths via the OS keychain
 * OAuth session that the user already logged into via the `claude` CLI.
 *
 * This is strictly a local-development provider:
 *   - Requires a logged-in Claude Code session on the host machine
 *   - Will not work in Cloud Functions / CI / production
 *   - Subject to your Claude Pro/Max rate limits (not API-tier limits)
 *
 * Returns the same { content, output, tokens, raw } shape as the other providers
 * so callers don't care which is in use.
 */
const DEFAULT_MODEL = 'claude-opus-4-7';

// Lazy import — only load the SDK if this provider is actually used
let _query;

function loadQuery() {
  if (!_query) {
    _query = require('@anthropic-ai/claude-agent-sdk').query;
  }

  return _query;
}

function ClaudeCode(assistant, key) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant?.Manager;
  self.user = assistant?.user;
  // key is ignored — claude-code uses OS keychain OAuth via forceLoginMethod: 'claudeai'

  self.tokens = {
    total:  { count: 0, price: 0 },
    input:  { count: 0, price: 0 },
    output: { count: 0, price: 0 },
  };

  return self;
}

ClaudeCode.prototype.request = async function (options) {
  const self = this;
  const assistant = self.assistant;

  options = options || {};
  const model = options.model || DEFAULT_MODEL;

  // Build prompt + system from the unified options shape
  const { system, prompt } = extractPromptAndSystem(options);

  if (!prompt) {
    throw new Error('claude-code provider requires options.message.content or options.messages with a user turn');
  }

  const query = loadQuery();
  const startTime = Date.now();

  // Build SDK options
  const sdkOptions = {
    model,
    forceLoginMethod: 'claudeai',  // Use Claude Pro/Max subscription, not API key
    allowedTools: [],               // Disable all built-in tools — we just want text/JSON in/out
    settingSources: [],             // Don't load .claude/ or ~/.claude/ settings
    includePartialMessages: false,
  };

  if (system) {
    sdkOptions.systemPrompt = system;
  }

  if (options.response === 'json' && options.schema) {
    sdkOptions.outputFormat = {
      type: 'json_schema',
      schema: options.schema,
    };
  }

  let resultText = '';
  let structuredOutput = null;
  let usage = null;
  let totalCostUSD = 0;

  try {
    for await (const message of query({ prompt, options: sdkOptions })) {
      // Collect text from assistant messages
      if (message.type === 'assistant') {
        for (const block of message.message?.content || []) {
          if (block.type === 'text') {
            resultText += block.text;
          }
        }
      }

      // Capture final result + usage from the result message
      if (message.type === 'result') {
        if (message.subtype === 'success') {
          structuredOutput = message.structured_output || null;
          resultText = message.result || resultText;
        }

        usage = message.usage;
        totalCostUSD = message.total_cost_usd || 0;

        if (message.is_error) {
          throw new Error(`claude-code: ${resultText || 'unknown error'}`);
        }
      }
    }
  } catch (e) {
    assistant?.error?.(`claude-code request failed: ${e.message}`);
    throw e;
  }

  // Update token counters
  if (usage) {
    self.tokens.input.count  += usage.input_tokens  || 0;
    self.tokens.output.count += usage.output_tokens || 0;
    self.tokens.total.count   = self.tokens.input.count + self.tokens.output.count;
    self.tokens.total.price   = totalCostUSD;
  }

  // Resolve content — prefer structured_output (validated against schema)
  let content;

  if (structuredOutput != null) {
    content = structuredOutput;
  } else if (options.response === 'json') {
    content = parseJsonLoose(resultText);
  } else {
    content = resultText;
  }

  assistant?.log?.(`claude-code: ${Date.now() - startTime}ms, ${usage?.output_tokens || 0} output tokens, $${totalCostUSD?.toFixed(4) || '0.0000'}`);

  return {
    output: [{ type: 'output_text', text: resultText }],
    content,
    tokens: self.tokens,
    raw: { usage, totalCostUSD },
  };
};

/**
 * Map unified options into a system prompt + a single user prompt string.
 */
function extractPromptAndSystem(options) {
  if (Array.isArray(options.messages) && options.messages.length) {
    const system = options.messages.find((m) => m.role === 'system')?.content;
    const lastUser = [...options.messages].reverse().find((m) => m.role !== 'system');

    return {
      system: stringifyContent(system),
      prompt: stringifyContent(lastUser?.content),
    };
  }

  return {
    system: stringifyContent(options.prompt?.content),
    prompt: stringifyContent(options.message?.content),
  };
}

function stringifyContent(content) {
  if (!content) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === 'input_text' || c.type === 'text')
      .map((c) => c.text || '')
      .join('\n');
  }

  return String(content);
}

function parseJsonLoose(text) {
  if (!text) return text;

  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const firstObj = cleaned.indexOf('{');
  const firstArr = cleaned.indexOf('[');
  const start = [firstObj, firstArr].filter((i) => i >= 0).sort((a, b) => a - b)[0];

  if (start > 0) {
    cleaned = cleaned.slice(start);
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    return text;
  }
}

module.exports = ClaudeCode;
