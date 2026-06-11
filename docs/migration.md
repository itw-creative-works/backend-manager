# Migration

Procedures for migrating old BEM consumer projects to the current format: environment variables (Part 1), legacy code patterns (Part 2), and routes/schemas (Part 3).

## Part 1: Environment Variable Migration

Convert old config formats (runtime config / nested JSON) into individual top-level environment variables in `functions/.env`.

### Key Mapping

| Old Path | New ENV Key |
|----------|-------------|
| `backend_manager.key` or `backendmanager.key` | `BACKEND_MANAGER_KEY` |
| `backend_manager.namespace` or `backendmanager.namespace` | `BACKEND_MANAGER_NAMESPACE` |
| `github.key` or `github.token` | `GITHUB_TOKEN` |
| `openai.key` or `openai.api_key` | `OPENAI_API_KEY` |
| `paypal.client_id` | `PAYPAL_CLIENT_ID` |
| `paypal.client_secret` | `PAYPAL_CLIENT_SECRET` |
| `stripe.secret_key` or `stripe.key` | `STRIPE_SECRET_KEY` |
| `chargebee.site` | `CHARGEBEE_SITE` |
| `chargebee.api_key` or `chargebee.key` | `CHARGEBEE_API_KEY` |
| `coinbase.api_key` or `coinbase.key` | `COINBASE_API_KEY` |
| `cloudflare.token` or `cloudflare.key` | `CLOUDFLARE_TOKEN` |
| `recaptcha.secret_key` or `recaptcha.key` | `RECAPTCHA_SECRET_KEY` |
| `sendgrid.api_key` or `sendgrid.key` | `SENDGRID_API_KEY` |
| `beehiiv.api_key` or `beehiiv.key` | `BEEHIIV_API_KEY` |
| `zerobounce.api_key` or `zerobounce.key` | `ZEROBOUNCE_API_KEY` |

### Steps

1. **Check for config sources**: first `functions/.runtimeconfig.json` (parse JSON); else a `RUNTIME_CONFIG` variable inside `functions/.env` (parse the object inside).
2. **Extract key-value pairs** using the mapping table.
3. **Backup existing `.env`** as `functions/.env.backup` if it exists.
4. **Check existing `.env` for conflicts**: skip existing keys and warn.
5. **Write/update `functions/.env`**: each mapped key as a top-level variable.
6. **Delete source files**: remove `functions/.runtimeconfig.json` if it existed.
7. **Update `functions/backend-manager-config.json`**: remove the deprecated `mailchimp` key entirely; update `brand` to the nested structure `{ name, url, contact: { email }, images: { brandmark, wordmark, combomark } }`; set `github.user` to `"itw-creative-works"`.
8. Update `functions/.nvmrc` to `v22/*` and `functions/package.json` `engines.node` to `"22"`.
9. Clean up `functions/.gitignore` duplicates.

## Part 2: Legacy Code Migration

Search all `.js` files under `functions/` for legacy config reads and convert to `process.env`:

- `Manager.config.*` → `process.env.KEY_NAME`
- `RUNTIME_CONFIG` → individual `process.env` vars
- `functions.config()` → `process.env` vars

| Old Pattern | New Pattern |
|-------------|-------------|
| `Manager.config.github.key` | `process.env.GITHUB_TOKEN` |
| `Manager.config.sendgrid.key` | `process.env.SENDGRID_API_KEY` |
| `Manager.config.stripe.secret_key` | `process.env.STRIPE_SECRET_KEY` |
| `Manager.config.openai.key` | `process.env.OPENAI_API_KEY` |
| `Manager.config.paypal.client_id` | `process.env.PAYPAL_CLIENT_ID` |
| `Manager.config.paypal.client_secret` | `process.env.PAYPAL_CLIENT_SECRET` |
| `Manager.config.chargebee.site` | `process.env.CHARGEBEE_SITE` |
| `Manager.config.chargebee.api_key` | `process.env.CHARGEBEE_API_KEY` |
| `Manager.config.coinbase.api_key` | `process.env.COINBASE_API_KEY` |
| `Manager.config.cloudflare.token` | `process.env.CLOUDFLARE_TOKEN` |
| `Manager.config.recaptcha.secret_key` | `process.env.RECAPTCHA_SECRET_KEY` |
| `Manager.config.beehiiv.api_key` | `process.env.BEEHIIV_API_KEY` |
| `Manager.config.zerobounce.api_key` | `process.env.ZEROBOUNCE_API_KEY` |
| `Manager.config.backend_manager.key` | `process.env.BACKEND_MANAGER_KEY` |
| `Manager.config.backend_manager.namespace` | `process.env.BACKEND_MANAGER_NAMESPACE` |

## Part 3: Route/Schema Migration

**IMPORTANT:** Only migrate routes that already use the middleware system in `functions/index.js`:

```javascript
// MIGRATE these (uses Manager.Middleware)
.https.onRequest((req, res) => Manager.Middleware(req, res).run('example'));

// DO NOT migrate these (old manual route loading)
.https.onRequest(async (req, res) => {
  return new (require(`${__dirname}/routes/example/index.js`))().main(Manager, req, res);
});
```

### Old → New Format

**Route:** constructor pattern → context-object export ([routes.md](routes.md)):

- `routes/example/index.js` → `routes/example/post.js` (or the appropriate method file)
- Remove the constructor; use `module.exports = async ({ Manager, assistant, analytics, usage, user, settings, libraries, utilities }) => {}`

**Schema:** wrapped tiers → flat ([schemas.md](schemas.md)):

- `schemas/example/index.js` → `schemas/example/post.js`
- Remove the `['defaults']:` wrapper; flatten the structure (plan adjustments move INSIDE the function, branching on `user`)
- Change the signature to the context object: `({ assistant, user, data, method, headers, geolocation, client })`
- Remove `value: undefined` noise

| Aspect | Old Format | New Format |
|--------|-----------|------------|
| Route export | `module.exports = Route` (constructor) | `module.exports = async ({ ... }) => {}` |
| Self reference | `const self = this;` | Not needed |
| File naming | `index.js` | `get.js`, `post.js`, `put.js`, `delete.js` |
| Schema wrapper | `['defaults']: { ... }` | Flat structure (no wrapper) |
| Schema params | `(assistant)` | `({ assistant, user, data, ... })` context object |

## See also

- [routes.md](routes.md) — the current route format being migrated TO
- [schemas.md](schemas.md) — the current schema contract
- [environment-detection.md](environment-detection.md) — env var conventions
