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

## Tools / web search (OpenAI)

`options.tools` (and optional `options.toolChoice`) are passed through to the OpenAI Responses API verbatim. Opt-in — when omitted, no tools are sent and behavior is identical to a plain request. Use this to enable OpenAI's built-in **web search** so the model finds and cites real, currently-live URLs instead of hallucinating them:

```js
const r = await ai.request({
  model: 'gpt-5.4',
  response: 'json',
  reasoning: { effort: 'medium' },
  tools: [{ type: 'web_search' }],
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
