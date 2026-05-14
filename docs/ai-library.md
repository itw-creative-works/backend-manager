# AI Library

`Manager.AI(assistant).request({ provider, model, messages, ... })` is the unified entry for all AI calls. Provider-agnostic surface — same options shape, same return shape.

| Provider | Default model | Notes |
|---|---|---|
| `openai` | `gpt-5-mini` | Better at structured JSON via JSON schema |
| `anthropic` | `claude-sonnet-4-6` | Better at SVG illustrations and creative output |

Return shape (same for all providers): `{ content, output, tokens, raw }`.

`options.response: 'json'` triggers JSON parsing — both providers strip fences and parse with JSON5 for robustness. `options.schema` enforces structure on OpenAI (real JSON schema) and is injected into the system prompt on Anthropic.

API keys: `BACKEND_MANAGER_OPENAI_API_KEY`, `BACKEND_MANAGER_ANTHROPIC_API_KEY` (process.env or config).

The legacy `src/manager/libraries/openai.js` is a thin compatibility shim that re-exports the OpenAI provider class — existing callers using `new OpenAI(assistant, key)` still work unchanged.

| File | Purpose |
|---|---|
| `src/manager/libraries/ai/index.js` | Unified `AI` class (dispatches by provider) |
| `src/manager/libraries/ai/providers/openai.js` | OpenAI provider (original `openai.js` content) |
| `src/manager/libraries/ai/providers/anthropic.js` | Anthropic provider (Claude Messages API) |
| `src/manager/libraries/openai.js` | Back-compat shim → providers/openai.js |
