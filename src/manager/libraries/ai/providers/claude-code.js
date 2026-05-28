/**
 * Claude Code provider — calls Claude over plain HTTPS using a Claude Code /
 * Claude Pro/Max OAuth token (NOT API credits).
 *
 * Unlike the Anthropic provider (which authenticates with an x-api-key and bills
 * API credits), this provider sends the OAuth token as `Authorization: Bearer ...`
 * plus the `anthropic-beta: oauth-2025-04-20` header, so usage bills against the
 * Claude subscription tied to the token.
 *
 * Token resolution (first match wins):
 *   1. explicit key passed to the constructor / options.apiKey
 *   2. Manager config: config.claude_code.oauth_token
 *   3. process.env.CLAUDE_CODE_OAUTH_TOKEN  (from `claude setup-token`)
 *
 * This is pure HTTPS — no `claude` binary, no subprocess — so it runs in Cloud
 * Functions / CI / anywhere Node runs. It is subject to the token's subscription
 * rate limits (not API-tier limits).
 *
 * The OAuth token is minted with `claude setup-token` (valid ~1 year). When it
 * expires (requests 401), re-mint and update the CLAUDE_CODE_OAUTH_TOKEN secret.
 * NOTE: the Bearer/beta subscription path is undocumented and may change.
 *
 * Returns the same { content, output, tokens, raw } shape as the other providers.
 */
const _ = require('lodash');
const JSON5 = require('json5');

const DEFAULT_MODEL = 'claude-opus-4-7';
const OAUTH_BETA = 'oauth-2025-04-20';

// Pricing per 1M tokens (USD) — informational only; subscription billing is flat.
const MODEL_TABLE = {
  'claude-opus-4-7':   { input: 15.00, output: 75.00 },
  'claude-opus-4-6':   { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':  { input: 1.00,  output: 5.00  },
};

function ClaudeCode(assistant, key) {
  const self = this;

  self.assistant = assistant;
  self.Manager = assistant?.Manager;
  self.user = assistant?.user;
  self.token = key
    || self.Manager?.config?.claude_code?.oauth_token
    || process.env.CLAUDE_CODE_OAUTH_TOKEN;

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

  options = _.merge({}, options);
  options.model = options.model || DEFAULT_MODEL;
  options.maxTokens = options.maxTokens || 2048;
  options.temperature = typeof options.temperature === 'undefined' ? 0.7 : options.temperature;

  const token = options.apiKey || self.token;

  if (!token) {
    throw new Error('claude-code provider requires a Claude OAuth token (set CLAUDE_CODE_OAUTH_TOKEN via `claude setup-token`)');
  }

  // Lazy-require the SDK so projects that don't use this provider don't need it.
  // We use the SDK purely as an HTTP client — `authToken` makes it send
  // `Authorization: Bearer <token>` instead of `x-api-key`, and the beta header
  // selects the subscription (OAuth) billing path. No `claude` binary involved.
  const SDK = require('@anthropic-ai/sdk');
  const client = new SDK({
    authToken: token,
    defaultHeaders: { 'anthropic-beta': OAUTH_BETA },
  });

  const { system, messages } = buildMessages(options);

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

  let raw;

  try {
    raw = await client.messages.create(requestBody);
  } catch (e) {
    assistant?.error?.(`claude-code request failed: ${e.message}`, e);
    throw e;
  }

  const outputText = (raw.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text.trim())
    .join('\n')
    .trim();

  const modelConfig = MODEL_TABLE[options.model] || MODEL_TABLE[DEFAULT_MODEL];

  self.tokens.input.count  += raw.usage?.input_tokens || 0;
  self.tokens.output.count += raw.usage?.output_tokens || 0;
  self.tokens.total.count   = self.tokens.input.count + self.tokens.output.count;
  self.tokens.input.price   = (self.tokens.input.count * modelConfig.input) / 1_000_000;
  self.tokens.output.price  = (self.tokens.output.count * modelConfig.output) / 1_000_000;
  self.tokens.total.price   = self.tokens.input.price + self.tokens.output.price;

  let parsed = outputText;

  if (options.response === 'json') {
    parsed = parseJsonLoose(outputText);
  }

  return {
    output: raw.content || [],
    content: parsed,
    tokens: self.tokens,
    raw,
  };
};

/**
 * Build Anthropic system + messages from the unified option shape.
 *
 * Accepts either:
 *   - options.messages: [{ role: 'system'|'user'|'assistant', content: string }]
 *   - options.prompt.content (system) + options.message.content (user)
 */
function buildMessages(options) {
  if (Array.isArray(options.messages) && options.messages.length) {
    const system = options.messages.find((m) => m.role === 'system')?.content;
    const messages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: stringifyContent(m.content) }));

    return { system: stringifyContent(system), messages };
  }

  const system = stringifyContent(options.prompt?.content || '');
  const userContent = stringifyContent(options.message?.content || '');

  return {
    system,
    messages: [{ role: 'user', content: userContent }],
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
  let cleaned = (text || '').trim();

  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  const candidates = [cleaned.indexOf('{'), cleaned.indexOf('[')].filter((i) => i >= 0);

  if (candidates.length) {
    const firstBrace = Math.min(...candidates);

    if (firstBrace > 0) {
      cleaned = cleaned.slice(firstBrace);
    }
  }

  try {
    return JSON5.parse(cleaned);
  } catch {
    return text;
  }
}

module.exports = ClaudeCode;
