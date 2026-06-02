# AI Library

`Manager.AI(assistant).request({ provider, model, messages, ... })` is the unified entry for all AI calls. Provider-agnostic surface — same options shape, same return shape.

| Provider | Default model | Notes |
|---|---|---|
| `openai` | `gpt-5-mini` | Better at structured JSON via JSON schema |
| `anthropic` | `claude-sonnet-4-6` | Better at SVG illustrations and creative output |
| `claude-code` | `claude-opus-4-7` | Same Claude models as `anthropic`, but bills a Claude Pro/Max **subscription** instead of API credits |

Return shape (same for all providers): `{ content, output, tokens, raw }`.

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

## Tools / web search (OpenAI)

Tools are nested under `options.tools` and opt-in — when omitted, no tools are sent and behavior is identical to a plain request:

- `tools.list` — array of tool definitions passed to the OpenAI Responses API verbatim. Built-in hosted tools (e.g. `{ type: 'web_search' }`, `{ type: 'code_interpreter' }`) OR custom function tools (`{ type: 'function', name, parameters }`).
- `tools.choice` *(optional)* — maps to `tool_choice` (`'auto'` | `'required'` | `'none'`, or a specific tool). Omit to let OpenAI default to `auto`.

The most common use is OpenAI's built-in **web search** so the model finds and cites real, currently-live URLs instead of hallucinating them:

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

When tools are active, the response `output` array may contain tool-call items (e.g. `web_search_call`) alongside the `message`; the message-text extractor ignores non-message items, so `r.content` is unaffected. URL citations live in the returned `output` (message content) as `annotations` of type `url_citation`.

## `claude-code` provider — subscription billing

The `claude-code` provider hits the same Claude Messages API as `anthropic`, but authenticates with a **Claude Code OAuth token** (`Authorization: Bearer ...` + `anthropic-beta: oauth-2025-04-20`) so usage bills the Claude Pro/Max subscription tied to the token rather than API credits.

It is **pure HTTPS** — no `claude` binary, no subprocess — so it runs in Cloud Functions / CI / anywhere Node runs.

Token resolution (first match wins): `options.apiKey` / constructor key → `config.claude_code.oauth_token` → `process.env.CLAUDE_CODE_OAUTH_TOKEN`.

Mint the token with `claude setup-token` (valid ~1 year). When it expires, requests 401 — re-mint and update the `CLAUDE_CODE_OAUTH_TOKEN` secret. There is no automatic refresh; renewal is a manual yearly step.

> **Caveats:** the Bearer/beta subscription path is undocumented and may change. Usage is subject to the subscription's rate limits (not API-tier limits). For high-volume production traffic, prefer `anthropic` + `BACKEND_MANAGER_ANTHROPIC_API_KEY`.

The legacy `src/manager/libraries/openai.js` is a thin compatibility shim that re-exports the OpenAI provider class — existing callers using `new OpenAI(assistant, key)` still work unchanged.

| File | Purpose |
|---|---|
| `src/manager/libraries/ai/index.js` | Unified `AI` class (dispatches by provider) |
| `src/manager/libraries/ai/providers/openai.js` | OpenAI provider (original `openai.js` content) |
| `src/manager/libraries/ai/providers/anthropic.js` | Anthropic provider (Claude Messages API, x-api-key, API credits) |
| `src/manager/libraries/ai/providers/claude-code.js` | claude-code provider (Claude Messages API, OAuth Bearer, subscription billing) |
| `src/manager/libraries/openai.js` | Back-compat shim → providers/openai.js |
