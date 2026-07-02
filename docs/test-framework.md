# Test Framework

## 🚫 NEVER mock — test against the real emulator (HARD RULE)

Tests run against a **real Firebase emulator** (real Firestore/Auth). **Do NOT hand-roll fake/stub/mock objects** — no `mockManager`, `mockAdmin`, `makeManager()`, fake `firestore()`/`admin`, stubbed `assistant`, or fake HTTP. Every test `run()` receives the **real** booted `Manager`, `assistant`, `firestore`, `http`, and `accounts` (see [the test context](#test-context)). Use them.

- Call routes over `http.as(...)`; call handlers/helpers with the real `Manager`/`assistant` from context; read/write/verify with the real `firestore` helper.
- **Pure functions are the only exception** — a function with zero I/O can be `require()`d and called with plain inputs (nothing to mock). The instant it touches Firestore or any external system, it must run for real against the emulator.
- **Real external APIs (OpenAI, PayPal, GitHub, SendGrid, Beehiiv, Stripe) are gated behind `TEST_EXTENDED_MODE` in the source, NOT mocked** — see [Extended Mode](#extended-mode-test_extended_mode). Normal mode skips them; extended mode runs them for real.
- **Anything an extended test creates in an external system must be cleaned up by the test** (delete the GitHub file, cancel the PayPal invoice, etc.) — the runner's pre-test wipe only covers local Firestore/Auth.

If you're writing `const mockX = {...}` to satisfy a function under test, STOP and pass the real context object instead.

### The ONLY two exceptions where a stub is allowed

Mock **nothing** by default. There are exactly two narrow cases where the real dependency genuinely cannot run in the test environment — and even then, stub the *smallest possible seam*, never a whole `Manager`/`assistant`:

1. **A side effect that would destroy the test run itself.** If invoking the real method would kill or corrupt the harness — e.g. a process-exit, an `app.quit()`, a destructive filesystem wipe, a recursive re-invocation of the test/build command — you may stub *that one call* to a no-op, assert the surrounding logic, then restore it. You are not faking behavior; you are preventing the harness from terminating mid-assertion.
2. **Cross-project fan-out that needs infrastructure you can't run locally.** Some routes fan out to *other* BEM backends (parent → child brand servers). Only **one** BEM emulator runs locally, so the real cross-project call has no second backend to hit. A unit test may hand-roll the minimal inputs (`makeManager`/`makeAdminMock`/mocked `wonderful-fetch`) to exercise the *fan-out logic* in isolation — but a companion integration test MUST still verify the real route's gate/wiring against the emulator. (Example: `test/helpers/webhook-forward.js`.)

**Rules for both exceptions:** stub the narrowest seam (one method / one module), restore it immediately, and add a comment stating *why the real thing can't run here*. If you can run it for real, you must.

## Test coverage — every surface gets a test (HARD RULE)

A feature is not done when it works — it's done when every surface it exposes is covered:

| Coverage | Where | Proves |
|---|---|---|
| **Logic** | `test/routes/` / `test/events/` | The handler does the right thing — exercised against the real emulator (real Manager, `assistant`, Firestore) |
| **Wiring** | Route round-trips over `http.as(...)` | The route is registered, auth-gated, schema-validated, and answers correctly over the real HTTP surface — this IS BEM's end-to-end |
| **Rules** | `test/rules/` suites | Firestore security rules permit/deny exactly as intended (required whenever rules change) |

BEM has no UI layer — a feature's UI coverage lives in the consuming frontend (UJM/BXM/EM), which has its own mirrored coverage convention. External-API paths are covered for real via [Extended Mode](#extended-mode-test_extended_mode), never mocked.

**Skipping a surface is the exception, not the default.** Skip ONLY when the feature genuinely doesn't expose that surface (a pure helper has no route; a route that touches no Firestore docs needs no rules test). Convenience is never a reason: "the handler test already covers it" does NOT excuse the route round-trip — handler tests prove the logic, round-trips prove the wiring (a route can be unregistered or mis-gated while every handler test stays green). When in doubt, write the test.

## Running Tests

**Where to run:** `npx mgr test` runs from a **Firebase project directory** — a consumer project's root or its `functions/` dir (the runner resolves the project from `cwd`, stripping a trailing `/functions`). A single `npx mgr test` **auto-launches the emulator** (Option 2 below) — you don't need to start one first.

```bash
# Option 1: Two terminals
npx mgr emulator  # Terminal 1 - keeps emulator running
npx mgr test      # Terminal 2 - runs tests

# Option 2: Single command (auto-starts emulator) — the usual way
npx mgr test
```

### Self-test from the framework repo (bundled fixture)

`npx mgr test` run **from the backend-manager repo itself** is a framework self-test: the repo has no `firebase.json`, so the runner boots a **bundled fixture project** ([`src/test/fixtures/firebase-project/`](../src/test/fixtures/firebase-project)) and runs ONLY the `test/boot/` smoke (emulator boots → fixture `Manager.init()` wires `bm_api` → health returns 200). Mirrors BXM's `BXM_TEST_BOOT_PROJECT` / UJM's `UJ_TEST_BOOT_PROJECT`. Set `BEM_TEST_BOOT_PROJECT=<path>` to self-test against a real consumer instead. The full `routes`/`events`/`rules` suites need a real consumer (use the designated test consumer `ultimate-jekyll-backend` after `npx mgr install dev`); the `boot/` smoke is excluded from consumer runs. **Full reference: [test-boot-layer.md](test-boot-layer.md).**

### Filtering tests

Pass a path (relative to `test/`) as a positional argument to run specific tests:

```bash
# Run a single test file
npx mgr test email/transactional

# Run all tests in a directory
npx mgr test routes/marketing

# Run only BEM framework tests (from node_modules/backend-manager/test/)
npx mgr test bem:email/templates

# Run only consumer project tests (from the project's own test/)
npx mgr test project:routes/custom

# Combine with extended mode for tests that hit real APIs (--extended sets the shared TEST_EXTENDED_MODE)
npx mgr test --extended routes/marketing/push-send
```

The filter matches against the test file path. `bem:` and `project:` prefixes scope the filter to framework-only or project-only tests respectively. Without a prefix, both are searched.

## Project mismatch detection

The test runner's health check verifies that the running emulator belongs to the **same project** as the test suite. If you leave project A's emulator running and run `npx mgr test` from project B, the hosting rewrites won't match and tests fail with mysterious 404s.

Detection uses two sources (tried in order):
1. **Firebase Emulator Hub** (`localhost:4400/emulators`) — always returns the emulator's `projectId`, regardless of BEM version.
2. **Health endpoint** (`/test/health`) — returns `projectId` from `Manager.config.firebaseConfig.projectId` (BEM 5.3.3+).

On mismatch the runner aborts immediately:
```
✗ Project mismatch: the running emulator belongs to "project-a" but this project is "project-b".
  Stop the other emulator first, then run: npx mgr emulator
```

## Cross-project API calls (single-emulator limitation)

Some routes fan out to **other BEM backends** — e.g. a sponsorship submission on `itw-creative-works` publishes a guest post to `ultimate-jekyll`'s `POST /admin/post`. Only **one** Firebase emulator can run locally at a time, so these cross-project calls **always hit the live deployed target**, even in test/dev mode.

This means:
- The target backend must be **deployed** with up-to-date code for extended tests to pass.
- Normal (non-extended) test mode **gates these calls** via `assistant.isTesting() && !process.env.TEST_EXTENDED_MODE` checks, returning synthetic results. Extended mode makes the real call.
- You **cannot** test cross-project API calls against a local emulator. If the live target is down or has a bug, extended tests that depend on it will fail.

## Test Data Cleanup — at the START of every run

**Hard rule: all LOCAL cleanup happens BEFORE the suite runs, never after.** If a previous run was killed mid-execution (Ctrl-C, OOM, emulator crash), end-of-run cleanup would never fire and the next run would inherit polluted state — broken trial-eligibility checks, leftover dispute alerts, stale webhook docs, polluted marketing-provider lists. Pre-test cleanup makes every run idempotent regardless of how the last one died.

What the runner wipes pre-test (in [src/test/test-accounts.js](../src/test/test-accounts.js) `deleteTestUsers()` and [src/test/runner.js](../src/test/runner.js) `setupAccounts()`):

1. **`meta/stats`** doc ensured (required for on-create batch writes).
2. **The ENTIRE emulator Firestore** — every top-level collection, flushed recursively (`flushEmulatorFirestore()` → `listCollections()` + `recursiveDelete()`). The emulator DB is 100% test data, so a full flush is the simplest correct clean slate — no per-collection allowlist to maintain. **SAFETY: it only runs when `FIRESTORE_EMULATOR_HOST` is set** (which the test command always sets); if absent it is a no-op, so it can never wipe a real project.
3. **Firebase Auth test users** — all `TEST_ACCOUNTS` uids deleted (Auth is a separate store from Firestore, so this still runs explicitly).
4. **Realtime Database** — the `_test` namespace removed in full (`admin.database().ref('_test').remove()`, guarded — RTDB is optional).

After the flush, `test/_init.js`'s `setup()` reseeds fixtures into the empty DB.

### Marketing-provider cleanup

Test signups never reach SendGrid + Beehiiv. The validation pipeline (`src/manager/libraries/email/validation.js`) blocks all `_test.*` emails at the marketing-library layer via the `/^_test\.(?!allow_)/` pattern in `blocked-local-patterns.js`.

The single exception is the `_test.allow_*` prefix. Two long-lived test accounts (`_test.allow_consent-granted@...` and `_test.allow_consent-declined@...`) intentionally round-trip through SendGrid + Beehiiv as the live-provider integration sentinels. They are exercised by `test/marketing/consent-lifecycle.js`, which manages its own setup, assertions, and teardown.

All cleanup follows the start-only rule. No trailing-cleanup exception.

### When adding a new test that writes data

Nothing to register — the **entire emulator Firestore is flushed before every run**, so any collection a test writes starts empty next run automatically. If a test needs a fixture to exist (e.g. a brand doc) before the suite runs, seed it in `test/_init.js`'s `setup()` (it runs after the flush). Realtime Database test data should live under `_test/...` (that namespace is wiped pre-run).

### Within-run state isolation is different

Per-test cleanup is still appropriate when a test sets up DB state that would pollute a **later test in the same run** — e.g. a `try/finally` that removes a fixture so the next sibling test sees a clean slate. Those stay in the test. They are *intra-run* state management, not *next-run* cleanup, and the distinction matters.

The rule: **never put cleanup at the END of a test file or suite for the purpose of preparing the next run** — for LOCAL state. The pre-test full flush already guarantees a clean slate. (The third-party provider exception lives in the runner's post-suite hook, not in individual tests.)

## `test/_init.js` — pre-test lifecycle hook

The runner loads an optional `test/_init.js` from **both** test roots — BEM core (`<bem>/test/_init.js`) and the consumer project (`<projectDir>/test/_init.js`) — and runs it before any test (it is NOT itself run as a test). Same contract for both roots, so framework and consumer authors write the identical file. Because the entire emulator Firestore is flushed each run, there are **no collection lists to declare** — `_init.js` only declares accounts and reseeds fixtures.

The module **must export a function** — `module.exports = (ctx) => ({ ... })` — called with `{ config, Manager }` and returning the hook object. (The function form lets a project compute its accounts/fixtures from config.) It may declare:

- `accounts` — array of extra test accounts to create alongside the built-in ones (admin/basic/premium-*/journey-*), so this project has a user for each lifecycle it exercises. Each entry is `{ id, uid, email, properties }` (email may use the `{domain}` placeholder, `properties` is merged into the user doc after `auth:on-create`). These accounts are created, fetched (privateKeys), and deleted on the same path as the built-ins, and show up in the `accounts` map that tests and `setup()` receive. A project account may override a built-in one by reusing its `id`.
- `async setup({ admin, config, accounts, Manager, assistant })` — seed fixtures (e.g. a brand doc) into the freshly-flushed DB, AFTER the clean slate + account creation. `accounts` is available so fixtures can reference a test uid. Use real ids that mirror production shape (no `_test-` prefix needed — the whole DB is wiped each run).

There is **no `cleanup` hook**: the entire emulator Firestore is flushed before every run and each test cleans up after itself, so there is nothing project-level to tear down.

```javascript
// <projectDir>/test/_init.js
module.exports = ({ config }) => ({
  // One account per lifecycle this project needs. Created alongside the built-ins.
  accounts: [
    { id: 'shop-owner', uid: '_test-shop-owner', email: '_test.shop-owner@{domain}', properties: { roles: {} } },
  ],

  // The entire emulator Firestore is flushed before each run, so just reseed.
  async setup({ admin, accounts }) {
    await admin.firestore().doc('brands/ultimate-jekyll').set({
      id: 'ultimate-jekyll',
      brand: { id: 'ultimate-jekyll', name: 'Ultimate Jekyll', url: 'https://ultimate-jekyll.itwcreativeworks.com' },
      owner: accounts['shop-owner'].uid,
      sponsorships: { prices: { 'guest-post': 50, 'link-insertion': 30 } },
    });
  },
});
```

## Extended Mode (`TEST_EXTENDED_MODE`)

`TEST_EXTENDED_MODE` is the **shared, unprefixed** extended-mode switch standardized across BEM/BXM/UJM/EM. It opts **in** to REAL external services (default: skipped). The CLI shorthand `--extended` sets it for you, so `npx mgr test --extended` is equivalent to `TEST_EXTENDED_MODE=true npx mgr test`. Either form works; the flag is just sugar over the env var.

Several routes/handlers skip external API calls (SendGrid, Beehiiv, Stripe webhooks, dispute handlers, marketing libraries) when `process.env.TEST_EXTENDED_MODE` is unset, so unit tests don't fire real emails or webhook side effects. Set the flag (or pass `--extended`) to opt **in** to those side effects for a full end-to-end run.

**BEM propagates the mode to BOTH spawned environments — the distinctive BEM detail.** The mode reaches (1) the **test-runner subprocess** (spawned with `{ ...process.env }`, so `TEST_EXTENDED_MODE` carries through) AND (2) the **running emulator's function workers** (via the `.temp/test-mode.json` shared state file written pre-flight by `src/test/utils/test-mode-file.js`, allowlisted in `SYNCED_ENV_KEYS`). That's why a single `--extended` on the test command flips both the runner's in-source gates and the live emulator without restarting it.

The marketing library gates at the SSOT level: `Marketing.add()`, `Marketing.sync()`, and `Marketing.remove()` each short-circuit with `if (assistant.isTesting() && !process.env.TEST_EXTENDED_MODE) return {}` before touching any provider. Callers (auth `onDelete`, webhook processors, contact-delete route) inherit the gate for free — do NOT rely on a per-caller guard for provider safety; add the gate to the library method itself when introducing a new provider-touching method.

**Live sync — no env coordination across terminals.** The flag flows automatically from the test command to the running emulator via a small shared state file at `<projectRoot>/.temp/test-mode.json`. The test command writes the file pre-flight; the emulator's function workers watch it via `fs.watch` and mutate their own `process.env.TEST_EXTENDED_MODE` in place. Effect: you only need to set the flag on **the test command**. The emulator follows.

```bash
# Terminal 1 — start once, leave running. NO flag needed.
npx mgr emulator

# Terminal 2 — toggle freely between runs:
npx mgr test --extended ...                 # runs in extended mode (--extended sets TEST_EXTENDED_MODE)
TEST_EXTENDED_MODE=true npx mgr test ...    # identical — the env-var form
npx mgr test ...                            # runs in normal mode
npx mgr test --extended ...                 # back to extended
```

The emulator log shows each flip, e.g.:

```
[test-mode] resolved TEST_EXTENDED_MODE=false (file present)   ← worker boot
[test-mode] flip TEST_EXTENDED_MODE: (unset) → true            ← test --extended fired
[test-mode] flip TEST_EXTENDED_MODE: true → (unset)            ← test (no flag) fired
```

The test command also confirms the mode in its own output (`Test mode: extended (real external APIs)` pre-flight, `Mode: extended (real external APIs)` after the health check) and prints the `⚠️ WARNING: TEST_EXTENDED_MODE IS TRUE ⚠️` block when extended. The runner's old "TEST_EXTENDED_MODE mismatch" warning is gone — mismatch is impossible by construction.

**Allowlist.** Only env vars listed in `SYNCED_ENV_KEYS` (`src/test/utils/test-mode-file.js`) flow through. Today: `TEST_EXTENDED_MODE`. Add a key there to make a new env var live-syncable across terminals. The allowlist exists to prevent accidentally syncing process-specific vars (`FIRESTORE_EMULATOR_HOST`) or sensitive ones (API keys).

**Preferred flow: set the flag on the test command.** Every `npx mgr test` invocation overwrites the shared state file with whatever flags it was called with, and the emulator follows live. This is the recommended pattern — start the emulator once with no flag, leave it running, control the mode from your test invocations.

```bash
# Recommended
npx mgr emulator                                # boots in normal mode
npx mgr test --extended ...                      # flips emulator to extended (or: TEST_EXTENDED_MODE=true npx mgr test ...)
npx mgr test ...                                 # flips emulator back to normal
```

**Also supported: set the flag on the emulator command.** This still works as a boot default — the emulator command writes the file with whatever it was started with, so the very first test run (before any `npx mgr test` overrides it) sees that mode. Useful if you want to inspect the emulator in a particular mode before firing any tests, or if you script the emulator boot from CI. Just know that the next test command overrides whatever you set here.

```bash
# Also works (boot default — overridden by next test command)
TEST_EXTENDED_MODE=true npx mgr emulator        # boots in extended mode
npx mgr test ...                                 # ← this still flips it back to normal
```

## Log Files

Test runs tee output to `functions/test.log` (own-emulator runs go to `functions/emulator.log` instead, since the test command delegates to the emulator command). Full reference — file table, the `functions/` location exception, `production.log`: [logging.md](logging.md).

## Filtering Tests

```bash
npx mgr test rules/             # Run rules tests (both BEM and project)
npx mgr test bem:rules/         # Only BEM's rules tests
npx mgr test project:rules/     # Only project's rules tests
npx mgr test user/ admin/       # Multiple paths
```

## Test Locations

- **BEM core tests:** `test/` (in the framework repo)
- **Project tests:** the consumer project's repo-root `test/` directory (NOT inside `functions/`)

Use `bem:` or `project:` prefix to filter by source. **Mirror the source path so a test reads like what it tests.** Route tests live under `test/routes/<route-path>/<concern>.js`, mirroring `functions/routes/<route-path>/` — e.g. `functions/routes/write/article/` → `test/routes/write/article/generate.js`, `functions/routes/sponsorship/post.js` → `test/routes/sponsorship/post.js`. Split each route into **one file per concern** under its mirrored dir (`test/routes/sponsorship/post.js`, `.../manual-validation.js`), never one giant `test/test.js`. The runner discovers files by directory, so the split also drives the `project:<path>` filter: `npx mgr test project:routes/write` runs a whole route's tests, `project:routes/write/markdown` runs one concern.

**The underscore convention:** `_`-prefixed files and directories at any depth under `test/` are excluded from suite discovery. Put shared helpers, fixture data, and non-test support files in `_`-prefixed paths — e.g. `test/_fixtures/`, `test/_helpers/`, `test/routes/_shared-utils.js`. The runner still specifically loads `test/_init.js` as the lifecycle hook. Matches the same convention in EM/BXM/UJM.

## Test Types

> **The runner reads each file's `module.exports` object — it does NOT inject Mocha/Jest globals.** A test file that calls `describe`/`it`/`before`/`beforeEach`/`after` at top level throws `ReferenceError: beforeEach is not defined` and shows as `Failed to load`. There is no global `assert` either — use the `assert` passed into `run({ assert })`. Every test file MUST export one of the shapes below.
>
> **The only lifecycle hook is `cleanup`** (per-test and module-level). Exporting `before`/`after`/`beforeEach` properties on the module does NOT error — the runner silently ignores them, so setup they were supposed to do never happens (this bit `helpers/ai-schema-resolve`, which failed for weeks because its fixtures were written in a `before()` that never ran). Seed disk/DB fixtures inside the tests themselves via an idempotent helper, or in `test/_init.js`'s `setup()`.

| Type | Use When | Behavior |
|------|----------|----------|
| Standalone | Single logical test | Runs once |
| Suite (`type: 'suite'`) | Sequential dependent tests | Shared state, stops on failure |
| Group (`type: 'group'`) | Multiple independent tests | Continues on failure |

### Standalone Test

```javascript
module.exports = {
  description: 'Test name',
  auth: 'none',  // none, user, admin, premium-active, premium-expired
  timeout: 10000,
  async run({ http, assert, accounts, firestore, state, waitFor }) { },
  async cleanup({ ... }) { },  // Optional
};
```

### Suite (Sequential with Shared State)

```javascript
module.exports = {
  description: 'Suite name',
  type: 'suite',
  tests: [
    { name: 'step-1', async run({ state }) { state.value = 'shared'; } },
    { name: 'step-2', async run({ state }) { /* state.value available */ } },
  ],
};
```

### Group (Independent Tests)

```javascript
module.exports = {
  description: 'Group name',
  type: 'group',
  tests: [
    { name: 'test-1', auth: 'admin', async run({ http, assert }) { } },
    { name: 'test-2', auth: 'none', async run({ http, assert }) { } },
  ],
};
```

## Context Object

| Property | Description |
|----------|-------------|
| `http` | HTTP client — sends requests to the hosting emulator as-is (see [HTTP Routing](#http-routing)) |
| `assert` | Assertion helpers (see below) |
| `accounts` | Test accounts `{ basic, admin, premium-active, ... }` |
| `firestore` | Direct admin DB access (`get`, `set`, `delete`, `exists`) — bypasses security rules |
| `rules` | Firestore **rules** testing client — `rules.asAccount(id)` returns a DB scoped to that user's auth, `rules.expectSuccess(op)` / `rules.expectFailure(op)` assert rule outcomes (see [Rules Tests](#rules-tests)) |
| `state` | Shared state (suites only) |
| `waitFor` | Polling helper `waitFor(condition, timeout, interval)` |
| `config` | Test configuration |
| `Manager` | Real booted BEM Manager (+ `Manager.Assistant()` etc.) |

## HTTP Routing

The `http` client sends requests directly to the hosting emulator (`http://localhost:5002`) with no magic prefix. The route string you pass becomes the URL path as-is — the hosting emulator's `firebase.json` rewrites handle routing to the correct Cloud Function.

```javascript
// BEM built-in routes — go through bm_api via firebase.json rewrite
http.post('backend-manager/payments/intent', { ... })
http.as('admin').get('backend-manager/admin/stats')
http.as('none').post('backend-manager/marketing/webhook?provider=sendgrid&key=...', [...])

// Consumer project routes — go to their own Cloud Functions via firebase.json rewrites
http.post('projects', { name: 'My Project' })
http.get('sender-accounts', { projectId: 'abc' })
http.as('none').post('webhooks', { event: 'reply', campaignId: '...' })
```

BEM routes live under `/backend-manager/*` — always include that prefix. Consumer routes use whatever path is in their `firebase.json` rewrites — no prefix needed.

## Assert Methods

```javascript
assert.ok(value, message)                      // Truthy
assert.equal(a, b, message)                    // Strict equality
assert.notEqual(a, b, message)                 // Not equal
assert.deepEqual(a, b, message)                // Deep equality
assert.match(value, /regex/, message)          // Regex match
assert.isSuccess(response, message)            // Response success
assert.isError(response, code, message)        // Response error with code
assert.hasProperty(obj, 'path.to.prop', msg)   // Property exists
assert.propertyEquals(obj, 'path', value, msg) // Property value
assert.isType(value, 'string', message)        // Type check
assert.contains(array, value, message)         // Array includes
assert.inRange(value, min, max, message)       // Number range
assert.fail(message)                           // Explicit fail
```

## Auth Levels

`none`, `user`/`basic`, `admin`, `premium-active`, `premium-expired`

## Email Tests (`test/email/`)

All email tests live under `test/email/`, mirroring `src/manager/libraries/email/`. The pipeline was unified under MJML — all templates are rendered server-side (no SendGrid dynamic templates).

| Test file | What it tests | Extended? |
|---|---|---|
| `templates.js` | MJML rendering for card/plain/order/feedback (11 tests) | No |
| `transactional.js` | Transactional email building (output shape assertions) | No |
| `validation.js` | Email format/disposable/corporate/local-part checks (80+ tests) | No |
| `transactional-send.js` | Single transactional send via SendGrid | Yes |
| `campaign-send.js` | Single marketing campaign send | Yes |
| `feedback-and-plain-send.js` | Feedback + plain template visual test sends | Yes |
| `newsletter-templates.js` | Newsletter MJML rendering (16 tests) | No |
| `newsletter-generate.js` | Full AI newsletter generation (5min timeout) | Yes |
| `marketing-lifecycle.js` | Contact lifecycle (add/sync/remove) | Yes |
| `consent-lifecycle.js` | Consent webhook round-trip | Yes |

Extended email tests send to `_test-<purpose>@{domain}` addresses (e.g. `_test-email-send@somiibo.com`). See [docs/email-system.md](email-system.md) for the full email system reference.

## Rules Tests

Security-rules tests use the `rules` client (`src/test/utils/firestore-rules-client.js`). Canonical pattern: **seed as admin (bypasses rules), then test operations as different users**:

```javascript
{
  name: 'setup-docs',
  auth: 'none',
  async run({ rules, accounts }) {
    const adminDb = rules.asAccount('admin');
    await rules.expectSuccess(
      adminDb.doc('items/test-1').set({
        owner: accounts.basic.uid,
        data: { name: 'Test' },
      })
    );
  },
},
{
  name: 'owner-can-read',
  auth: 'none',
  async run({ rules }) {
    const db = rules.asAccount('basic');
    await rules.expectSuccess(db.doc('items/test-1').get());
  },
},
{
  name: 'other-user-cannot-read',
  auth: 'none',
  async run({ rules }) {
    const db = rules.asAccount('basic');
    await rules.expectFailure(db.doc('items/admin-owned').get());
  },
},
```

## Test Account Isolation (CRITICAL)

**NEVER use shared accounts (`basic`, `admin`, `premium-active`, …) with the `test` processor or any operation that creates side-effect data** (orders, webhooks, subscriptions, consent revocations). The test processor auto-fires webhooks that upgrade a user's subscription asynchronously — using `basic` for a payment-intent test upgrades `basic` to a paid subscription and breaks every subsequent test that depends on `basic` being a basic user.

**Rule: any test that creates persistent side-effect data MUST use a dedicated `journey-*` account.**

```javascript
// ❌ WRONG — pollutes the shared 'basic' account
const response = await http.as('basic').post('payments/intent', { processor: 'test', ... });

// ✅ CORRECT — dedicated journey account
const response = await http.as('journey-payments-intent-discount').post('payments/intent', { processor: 'test', ... });
```

**When to create a journey account:** the test uses `processor: 'test'`, creates docs in `payments-orders` / `payments-intents` / `payments-webhooks`, modifies subscription state, sends webhooks that trigger Firestore onWrite handlers, or **writes `consent.marketing` (grant/revoke)** — e.g. marketing webhook revoke events, or `DELETE /marketing/contact` (which mirrors `revoked` to the user doc). Revoked consent persists for the rest of the run and trips the email library's consent gate (`{ blocked: 'consent' }`) on every later `sync()`/`add()` of that account. Existing examples: `journey-webhook-revoke` (webhook revoke events), `journey-marketing-sync` (extended-mode live-provider sync + cleanup; `_test.allow_*` prefix). Add new ones to `src/test/test-accounts.js` (framework tests) or your project's `test/_init.js` `accounts` array (consumer tests).

**Shared accounts are safe for:** validation-only tests (missing fields, invalid input, auth rejection, unknown processor), read-only operations, and tests with no async side effects.

## Test Naming Conventions

- **Test names:** kebab-case, descriptive: `'user-can-read-own-doc'`, `'duplicate-submission-rejected'`
- **File names:** match the route method or collection name: `post.js`, `submissions.js`, `signup.js`
- **Descriptions:** present tense, concise: `'Schema validation'`, `'Submission lifecycle'`

## Common Patterns

**Auth rejection** — always test that unauthenticated requests fail:

```javascript
{
  name: 'unauthenticated-rejected',
  async run({ http, assert }) {
    const response = await http.as('none').post('user/signup', {});
    assert.isError(response, 401, 'Should fail without authentication');
  },
},
```

**Duplicate rejection** — send concurrent identical requests; exactly one should win:

```javascript
{
  name: 'duplicate-rejected',
  timeout: 30000,
  async run({ assert, config }) {
    const body = JSON.stringify({ name: 'Dupe' });
    const [a, b] = await Promise.all([
      fetch(url, { method: 'POST', body }),
      fetch(url, { method: 'POST', body }),
    ]);
    const successes = [a, b].filter(r => r.status === 'success');
    const failures = [a, b].filter(r => r.status === 'fail');
    assert.ok(successes.length === 1 && failures.length === 1, 'One should succeed, one should fail');
  },
},
```

**Cleanup** — final suite test deletes what the suite created (see [Test Data Cleanup](#test-data-cleanup--at-the-start-of-every-run) for the start-of-run wipe):

```javascript
{
  name: 'cleanup',
  async run({ firestore, state }) {
    try {
      await firestore.delete(`submissions/${state.id}`);
      await firestore.delete(`forms/${state.formId}`);
    } catch (e) { /* ignore cleanup errors */ }
  },
},
```

## Key Test Files

| File | Purpose |
|------|---------|
| `src/test/runner.js` | Test runner |
| `test/` | BEM core tests |
| `src/test/utils/assertions.js` | Assert helpers |
| `src/test/utils/http-client.js` | HTTP client |
| `src/test/utils/firestore-rules-client.js` | Rules testing client (`asAccount` / `expectSuccess` / `expectFailure`) |
| `src/test/test-accounts.js` | Test account definitions |
| `test/routes/test/schema.js` | Schema-validation reference test |
| `test/routes/user/signup.js` | Full-lifecycle route suite reference |
| `test/rules/user.js` | Rules-test reference |
