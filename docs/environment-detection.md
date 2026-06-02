# Environment Detection

`getEnvironment()` returns exactly ONE of three mutually-exclusive, exhaustive values:

```javascript
Manager.getEnvironment()    // 'development' | 'testing' | 'production'

Manager.isDevelopment()     // true ONLY in development
Manager.isTesting()         // true ONLY in testing
Manager.isProduction()      // true ONLY in production
```

**The Manager is the single source of truth.** `getEnvironment()` is the ONLY function that reads the raw signals (`BEM_TESTING` / `ENVIRONMENT` / `FUNCTIONS_EMULATOR` / `TERM_PROGRAM`). The three `is*()` checks **derive** from it live on every call — they never read raw signals themselves, so they can never disagree with `getEnvironment()`.

**The assistant forwards to the Manager.** Request handlers receive an `assistant`, so the same methods are exposed there and return identical results — call whichever is in scope:

```javascript
assistant.getEnvironment()  // === Manager.getEnvironment() — a thin forward
assistant.isTesting()       // === Manager.isTesting()
```

(An assistant always has a Manager — `init()` throws without one. The `assistant.meta.environment` field is still populated for code that reads it, but the `is*()` checks no longer depend on that snapshot.)

**Resolution order:** testing wins first, then production, else development. The three checks are mutually exclusive — exactly one is true. `isDevelopment()` is **false** during testing, and `isProduction()` is a real positive check (it is NOT `!isDevelopment()`).

## Available helpers

| Helper | Returns |
|---|---|
| `getEnvironment()` | `'development' \| 'testing' \| 'production'` — the SSOT resolver; the only reader of raw signals. |
| `isDevelopment()` | `true` ONLY in development (local Firebase emulator / dev), and NOT testing. Derives from `getEnvironment()`. |
| `isTesting()` | `true` ONLY in testing (`BEM_TESTING === 'true'`). **Takes precedence** — a test run is not development. |
| `isProduction()` | `true` ONLY in production (deployed Cloud Functions). A **real positive check** — NOT `!isDevelopment()`. |

## Gating side effects — use the INTENTIONAL check

Because there are three environments, never gate a side effect on a two-value assumption. State what you mean:

```javascript
// Production-only (skip real emails/analytics/Sentry/webhooks in dev AND testing):
if (isProduction())  { /* do the real thing */ }
if (!isProduction()) { /* skip / use the safe local behavior */ }

// Local-or-test (anything that should run in BOTH dev and testing):
if (isDevelopment() || isTesting()) { /* localhost URL, console logging, etc. */ }
```

**Avoid** `if (!isDevelopment())` or `if (env !== 'development')` to gate production behavior — those wrongly include `testing` as production and leak real side effects (emails, analytics, Sentry) during test runs. This is the bug class that motivated the 3-value model.

## URL helpers

```javascript
Manager.getApiUrl()  // this brand's API URL — the SSOT for calling the BEM API
```

**`Manager.getApiUrl()` is the one and only way to get the API URL.** It resolves to the **local** hosting emulator (`http://localhost:5002`) in development OR testing, and to production (`https://api.{domain}`) otherwise. Always call `getApiUrl()` directly — do NOT read the cached `Manager.project.apiUrl` property (it's a boot-time snapshot kept only for internal env-var export; the getter is the SSOT and always fresh). Build full endpoints by appending the path: `` `${Manager.getApiUrl()}/backend-manager/admin/post` ``.

Resolving local in test mode is required because tests hit the local emulator — without it, internal BEM→BEM calls (and tests calling `getApiUrl()`) would leak to the live production server. Pass an explicit `env` arg (`getApiUrl('production')`) only to force a specific environment regardless of the current one — rarely needed, and mainly used by tests to pin a specific environment's mapping.

> `getFunctionsUrl()` (raw Cloud Functions URL) exists for the ONE internal case that must name a specific deployed function by its raw address (`assistant.tryUrl()`). Application/route code should never need it — use `getApiUrl()`.

**Exception — parent helpers stay live:** `Manager.getParentApiUrl()` / `getParentUrl()` ALWAYS return the live production URL, even in dev/test. The parent BEM is a real remote server with no localhost equivalent, so cross-brand parent calls are never redirected to localhost.

## Where they live

Source: [src/manager/index.js](../src/manager/index.js). BEM has a single Manager (no multi-context mixin like EM/UJM/BXM), so `getEnvironment()` + `is*()` + the URL helpers live directly on the Manager. The `assistant` exposes the same methods and forwards each to its Manager (`assistant.isTesting()` → `Manager.isTesting()`), so request handlers can call whichever object is in scope.

## How detection works

`getEnvironment()` resolves in this precedence order:

1. **Testing** — `process.env.BEM_TESTING === 'true'` (set by the test runner / emulator). A test run is a test run regardless of any other signal.
2. **Production** — `process.env.ENVIRONMENT === 'production'`.
3. **Development** — `process.env.ENVIRONMENT === 'development'`, or `FUNCTIONS_EMULATOR` is set, or `TERM_PROGRAM` is `Apple_Terminal` / `vscode` (running locally).
4. **Default** — production. BEM's deployed *runtime* can legitimately lack a dev signal (a live Cloud Function has no `FUNCTIONS_EMULATOR`), so "no signal" IS the normal production state. (Contrast UJM/BXM, whose deployed artifacts always carry their signal baked in, so they default to **development** — a bare context there is just build tooling. EM defaults to production for the same reason as BEM.)

## Adding a new helper

If you need a new environment-derived helper, add it next to the others on the Manager in [src/manager/index.js](../src/manager/index.js), and forward it from the assistant if request handlers need it. Don't read `process.env` ad-hoc elsewhere — derive from `getEnvironment()` so there is one source of truth and no chance of drift.

## Why this matters

**One signal, used everywhere.** The test runner sets `BEM_TESTING=true`; every piece of code that calls `isTesting()` (framework or consumer) then sees `true` — no need to invent a per-module env var.

**Sub-modules check the same signal.** When framework code (an analytics flush, a webhook fan-out) needs to skip side effects in tests, it checks `isTesting()` — the same answer the consumer's own code gets. No drift.

**`is*()` can never disagree with `getEnvironment()`.** Because the checks derive from the single resolver instead of reading raw signals, there is exactly one definition of "what environment is this," and a wrong-but-confident gate (leaking real emails during a test run) is structurally impossible.

## See also

- [testing.md](testing.md) — `BEM_TESTING` is set automatically by the test runner; `TEST_EXTENDED_MODE` gates real external APIs.
