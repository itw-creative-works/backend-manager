/**
 * Anthropic provider for the unified AI library.
 *
 * Public surface matches the OpenAI provider:
 *   new Anthropic(assistant, key).request(options) → { content, output, tokens, raw }
 *
 * Maps the Claude Messages API onto the OpenAI provider's option shape so callers
 * can swap providers without rewriting call sites.
 */
const _ = require('lodash');
const JSON5 = require('json5');
const format = require('./anthropic-format.js');

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Pricing per 1M tokens (USD). Update when Anthropic changes their pricing page.
const MODEL_TABLE = {
  'claude-opus-4-7':   { input: 15.00, output: 75.00, features: { json: true, temperature: true, reasoning: true } },
  'claude-opus-4-6':   { input: 15.00, output: 75.00, features: { json: true, temperature: true, reasoning: true } },
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00, features: { json: true, temperature: true, reasoning: true } },
  'claude-haiku-4-5':  { input: 1.00,  output: 5.00,  features: { json: true, temperature: true, reasoning: false } },
};

function Anthropic(assistant, key) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant?.Manager;
  self.user = assistant?.user;
  self.key = key
    || self.Manager?.config?.anthropic?.key
    || process.env.ANTHROPIC_API_KEY
    || process.env.BACKEND_MANAGER_ANTHROPIC_API_KEY;

  self.tokens = {
    total:  { count: 0, price: 0 },
    input:  { count: 0, price: 0 },
    output: { count: 0, price: 0 },
  };

  return self;
}

Anthropic.prototype.request = async function (options) {
  const self = this;
  const assistant = self.assistant;

  options = _.merge({}, options);
  options.model = options.model || DEFAULT_MODEL;
  options.maxTokens = options.maxTokens || 2048;
  options.temperature = typeof options.temperature === 'undefined' ? 0.7 : options.temperature;
  options.timeout = options.timeout || 120000;

  if (!self.key) {
    throw new Error('Anthropic API key not configured (set BACKEND_MANAGER_ANTHROPIC_API_KEY)');
  }

  // Lazy-require the SDK so projects that don't use Anthropic don't need it installed
  const SDK = require('@anthropic-ai/sdk');
  const client = new SDK({ apiKey: self.key });

  // Build messages from the OpenAI-style option shape (prompt + message) or
  // unified messages turns (incl. assistant toolCalls + role:'tool' results)
  const { system, messages } = format.buildMessages(options);

  // JSON output via system prompt instruction (Anthropic's structured output is via prompt, not a flag)
  let systemFinal = system;

  if (options.response === 'json') {
    systemFinal = `${systemFinal || ''}\n\nYou MUST respond with valid JSON only. No prose, no markdown fences, no explanation — just the JSON object.${options.schema ? `\n\nThe JSON must conform to this schema:\n${JSON.stringify(options.schema)}` : ''}`.trim();
  }

  const requestBody = {
    model: options.model,
    max_tokens: options.maxTokens,
    messages,
  };

  if (systemFinal) {
    requestBody.system = systemFinal;
  }

  if (options.temperature !== undefined) {
    requestBody.temperature = options.temperature;
  }

  // Native tool calling — normalized function tools only ({ name, description,
  // parameters }); provider-specific hosted tools throw in buildToolDefs
  const toolDefs = format.buildToolDefs(options.tools?.list);

  if (toolDefs.length) {
    requestBody.tools = toolDefs;

    const toolChoice = format.buildToolChoice(options.tools?.choice);

    if (toolChoice) {
      requestBody.tool_choice = toolChoice;
    }
  }

  let raw;

  try {
    raw = await client.messages.create(requestBody);
  } catch (e) {
    assistant?.error?.(`Anthropic request failed: ${e.message}`, e);
    throw e;
  }

  // Extract text from content blocks (concatenate text blocks) and tool calls
  // from tool_use blocks — a tool-call turn legitimately has content: ''
  const outputText = (raw.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text.trim())
    .join('\n')
    .trim();

  const toolCalls = format.extractToolCalls(raw.content);
  const stopReason = format.mapStopReason(raw.stop_reason);

  // Update token counters
  const modelConfig = MODEL_TABLE[options.model] || MODEL_TABLE[DEFAULT_MODEL];

  self.tokens.input.count  += raw.usage?.input_tokens || 0;
  self.tokens.output.count += raw.usage?.output_tokens || 0;
  self.tokens.total.count   = self.tokens.input.count + self.tokens.output.count;
  self.tokens.input.price   = (self.tokens.input.count * modelConfig.input) / 1_000_000;
  self.tokens.output.price  = (self.tokens.output.count * modelConfig.output) / 1_000_000;
  self.tokens.total.price   = self.tokens.input.price + self.tokens.output.price;

  // Parse JSON if requested — but never on a tool-call turn, where empty/partial
  // text is the normal intermediate state (the caller continues the loop)
  let parsed = outputText;

  if (options.response === 'json' && !toolCalls.length) {
    parsed = parseJsonLoose(outputText);
  }

  return {
    output: raw.content || [],
    content: parsed,
    tokens: self.tokens,
    raw,
    toolCalls,
    stopReason,
  };
};

/**
 * Parse JSON from Claude output. Claude usually obeys the "JSON only" instruction
 * but occasionally wraps responses in ```json fences or adds a sentence before.
 * Strip fences and try JSON5 for robustness.
 */
function parseJsonLoose(text) {
  let cleaned = text.trim();

  // Strip ```json ... ``` fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // Find first { or [ and last } or ] to handle preamble text
  const firstBrace = Math.min(
    ...[cleaned.indexOf('{'), cleaned.indexOf('[')].filter((i) => i >= 0),
  );

  if (firstBrace > 0) {
    cleaned = cleaned.slice(firstBrace);
  }

  return JSON5.parse(cleaned);
}

module.exports = Anthropic;
