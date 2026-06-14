# AI Library

`Manager.AI(assistant).request({ provider, model, messages, ... })` is the unified entry for all AI calls. Provider-agnostic surface — same options shape, same return shape.

| Provider | Default model | Notes |
|---|---|---|
| `openai` | `gpt-5-mini` | Better at structured JSON via JSON schema |
| `anthropic` | `claude-sonnet-4-6` | Better at SVG illustrations and creative output |
| `claude-code` | `claude-opus-4-7` | Same Claude models as `anthropic`, but bills a Claude Pro/Max **subscription** instead of API credits |

Return shape (same for all providers): `{ content, output, tokens, raw }` — plus `toolCalls` and `stopReason` when tools are in play (see Tools below).

`options.response: 'json'` triggers JSON parsing — all providers strip fences and parse with JSON5 for robustness. `options.schema` enforces structure on OpenAI (real JSON schema) and is injected into the system prompt on Anthropic / claude-code.

API keys: `BACKEND_MANAGER_OPENAI_API_KEY`, `BACKEND_MANAGER_ANTHROPIC_API_KEY` (process.env or config).

## Image generation (OpenAI)

`Manager.AI(assistant).image({ prompt, ... })` generates an image via OpenAI's image model (`gpt-image-2` by default). Separate from `request()` because the return type is bytes, not text — it bypasses moderation, token accounting, schema, and prompt-normalization (none apply to image gen).

```js
const ai = Manager.AI(assistant);
const { buffer, b64, mime, revisedPrompt } = await ai.image({
  prompt: 'Minimal flat vector illustration of a rocket, undraw.co style, blue + white, no text.',
  size: '1024x1024',   // 1024x1024 | 1536x1024 | 1024x1536 | auto (default 1024x1024)
  quality: 'medium',   // low | medium | high | auto (default medium)
  background: 'opaque', // transparent | opaque | auto (opt-in)
  n: 1,                // default 1; n > 1 returns an array
});
// buffer is a PNG Buffer; b64 is the same data base64-encoded.
```

Return shape (single image): `{ buffer, b64, mime, revisedPrompt, model, size, quality, raw }`. With `n > 1` it returns an array of those.

`gpt-image-2` always returns base64 (no URL round-trip). Generation is slow — `medium`/`1024²` ≈ 40-50s; the default request timeout is 5 minutes. Only `openai` implements `image()`; calling it on another provider throws.

API key resolution is the same as `request()` — `BACKEND_MANAGER_OPENAI_API_KEY` / `OPENAI_API_KEY` (process.env or config).

## Tools — cross-provider function calling (agentic loops)

Tools are nested under `options.tools` and opt-in — when omitted, no tools are sent and behavior is identical to a plain request.

- `tools.list` — array of tool definitions. **Normalized function tools** (`{ name, description, parameters }` where `parameters` is a JSON Schema object — `type: 'function'` optional) work on EVERY provider. Provider-specific hosted tools (e.g. `{ type: 'web_search' }`, `{ type: 'code_interpreter' }`) pass verbatim on OpenAI and throw a clear error on Anthropic/claude-code.
- `tools.choice` *(optional)* — `'auto' | 'required' | 'none'`, or `{ name: 'tool_name' }` to force a specific tool. Mapped per provider (Anthropic: `auto`/`any`/`none`/`tool`).

When the model decides to call tools, the response carries them in normalized form:

- `r.toolCalls` — `[{ id, name, arguments }]`, `arguments` already parsed to an object.
- `r.stopReason` — `'tool_use' | 'end' | 'max_tokens'`.

A tool-call turn legitimately has `content: ''` — `response: 'json'` parsing is skipped on tool-call turns (the caller is expected to continue the loop, not consume a final answer).

### Loop continuation via `options.messages`

Structured conversations pass the full turn history through `options.messages` with two cross-provider conventions:

- Assistant tool-call turn: `{ role: 'assistant', content?, toolCalls: [{ id, name, arguments }] }` — or replay the provider's raw blocks (`{ role: 'assistant', content: r.raw.content }`) on Anthropic.
- Tool result turn: `{ role: 'tool', toolCallId, content }` — consecutive tool results merge into one Anthropic user turn of `tool_result` blocks; OpenAI gets `function_call_output` items.

```js
const ai = Manager.AI(assistant);
const messages = [
  { role: 'system', content: 'Use tools to answer.' },
  { role: 'user', content: 'What is the weather in Paris?' },
];
const tools = { list: [{ name: 'get_weather', description: '...', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }] };

const first = await ai.request({ provider: 'anthropic', messages, tools });
// first.stopReason === 'tool_use'; first.toolCalls = [{ id, name: 'get_weather', arguments: { city: 'Paris' } }]

messages.push({ role: 'assistant', content: first.raw.content });          // or { role: 'assistant', toolCalls: first.toolCalls }
messages.push({ role: 'tool', toolCallId: first.toolCalls[0].id, content: '{"temp":"21C"}' });

const second = await ai.request({ provider: 'anthropic', messages, tools });
// second.stopReason === 'end'; second.content is the final answer
```

`normalizeOptions()` detects structured conversations (tool turns / toolCalls / raw blocks) and leaves them intact — only the system turn gets the universal prompt injections. Plain-text `messages[]` keep their legacy behavior, except OpenAI now sends ALL turns (previously middle turns were dropped in favor of prompt/message/history).

### Hosted web search (OpenAI only)

```js
const r = await ai.request({
  model: 'gpt-5.4',
  response: 'json',
  reasoning: { effort: 'medium' },
  tools: { list: [{ type: 'web_search' }] },
  prompt: { path: '.../research/system.md', settings },
  message: { path: '.../research/user.md', settings },
});
```

URL citations live in the returned `output` (message content) as `annotations` of type `url_citation`.

## `test` provider — deterministic scripted AI for test suites

`provider: 'test'` is the AI analog of the `test` payment processor: a first-class provider that suites drive with directives in the LAST user message, so consumer routes exercise their full loop (Firestore writes, usage, locks, tool execution) against the real emulator with zero paid API calls. It **refuses to run outside development/testing**.

Directives form a sequence consumed across loop turns (call N executes directive N-1, indexed by assistant turns after the last user turn). Directive values must not contain `]]` internally (a trailing JSON `]` is fine):

| Directive | Behavior |
|---|---|
| `[[tool:name {json}]]` | Emit one tool call this step (`stopReason: 'tool_use'`) |
| `[[tools:[{"name":"a","arguments":{}}, ...]]]` | Emit parallel tool calls this step |
| `[[reply:{json}]]` | Final reply (parsed when `response: 'json'`) |
| `[[delay:ms]]` | Modifier — delay the NEXT step (max 30s) |
| `[[error:msg]]` | Throw at this step |
| *(none / exhausted)* | Echo reply: `Echo: <message>` (`{ message }` in json mode) |

## `claude-code` provider — subscription billing

The `claude-code` provider hits the same Claude Messages API as `anthropic`, but authenticates with a **Claude Code OAuth token** (`Authorization: Bearer ...` + `anthropic-beta: oauth-2025-04-20`) so usage bills the Claude Pro/Max subscription tied to the token rather than API credits.

It is **pure HTTPS** — no `claude` binary, no subprocess — so it runs in Cloud Functions / CI / anywhere Node runs.

Token resolution (first match wins): `options.apiKey` / constructor key → `config.claude_code.oauth_token` → `process.env.CLAUDE_CODE_OAUTH_TOKEN`.

Mint the token with `claude setup-token` (valid ~1 year). When it expires, requests 401 — re-mint and update the `CLAUDE_CODE_OAUTH_TOKEN` secret. There is no automatic refresh; renewal is a manual yearly step.

> **Caveats:** the Bearer/beta subscription path is undocumented and may change. Usage is subject to the subscription's rate limits (not API-tier limits). For high-volume production traffic, prefer `anthropic` + `BACKEND_MANAGER_ANTHROPIC_API_KEY`.

The legacy `src/manager/libraries/openai.js` is a thin compatibility shim that re-exports the OpenAI provider class — existing callers using `new OpenAI(assistant, key)` still work unchanged.

| File | Purpose |
|---|---|
| `src/manager/libraries/ai/index.js` | Unified `AI` class (dispatches by provider; structured-messages detection) |
| `src/manager/libraries/ai/providers/openai.js` | OpenAI provider (Responses API; direct-messages mode + tool envelopes) |
| `src/manager/libraries/ai/providers/anthropic.js` | Anthropic provider (Claude Messages API, x-api-key, API credits, native tool_use) |
| `src/manager/libraries/ai/providers/claude-code.js` | claude-code provider (Claude Messages API, OAuth Bearer, subscription billing, native tool_use) |
| `src/manager/libraries/ai/providers/anthropic-format.js` | Shared pure formatters for both Claude providers (tool defs, message building, extraction) |
| `src/manager/libraries/ai/providers/test.js` | Deterministic `test` provider (scripted directives; dev/testing only) |
| `src/manager/libraries/openai.js` | Back-compat shim → providers/openai.js |
