# Testing

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

## Running Tests

```bash
# Option 1: Two terminals
npx mgr emulator  # Terminal 1 - keeps emulator running
npx mgr test      # Terminal 2 - runs tests

# Option 2: Single command (auto-starts emulator)
npx mgr test
```

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

Several routes/handlers skip external API calls (SendGrid, Beehiiv, Stripe webhooks, dispute handlers, marketing libraries) when `process.env.TEST_EXTENDED_MODE` is unset, so unit tests don't fire real emails or webhook side effects. Set the flag to opt **in** to those side effects for a full end-to-end run.

The marketing library gates at the SSOT level: `Marketing.add()`, `Marketing.sync()`, and `Marketing.remove()` each short-circuit with `if (assistant.isTesting() && !process.env.TEST_EXTENDED_MODE) return {}` before touching any provider. Callers (auth `onDelete`, webhook processors, contact-delete route) inherit the gate for free — do NOT rely on a per-caller guard for provider safety; add the gate to the library method itself when introducing a new provider-touching method.

**Live sync — no env coordination across terminals.** The flag flows automatically from the test command to the running emulator via a small shared state file at `<projectRoot>/.temp/test-mode.json`. The test command writes the file pre-flight; the emulator's function workers watch it via `fs.watch` and mutate their own `process.env.TEST_EXTENDED_MODE` in place. Effect: you only need to set the flag on **the test command**. The emulator follows.

```bash
# Terminal 1 — start once, leave running. NO flag needed.
npx mgr emulator

# Terminal 2 — toggle freely between runs:
TEST_EXTENDED_MODE=true npx mgr test ...   # runs in extended mode
npx mgr test ...                            # runs in normal mode
TEST_EXTENDED_MODE=true npx mgr test ...   # back to extended
```

The emulator log shows each flip, e.g.:

```
[test-mode] resolved TEST_EXTENDED_MODE=false (file present)   ← worker boot
[test-mode] flip TEST_EXTENDED_MODE: (unset) → true            ← test --extended fired
[test-mode] flip TEST_EXTENDED_MODE: true → (unset)            ← test (no flag) fired
```

The test command also confirms the mode in its own output (`Test mode: EXTENDED (real APIs)` pre-flight, `Mode: EXTENDED (real APIs)` after the health check). The runner's old "TEST_EXTENDED_MODE mismatch" warning is gone — mismatch is impossible by construction.

**Allowlist.** Only env vars listed in `SYNCED_ENV_KEYS` (`src/test/utils/test-mode-file.js`) flow through. Today: `TEST_EXTENDED_MODE`. Add a key there to make a new env var live-syncable across terminals. The allowlist exists to prevent accidentally syncing process-specific vars (`FIRESTORE_EMULATOR_HOST`) or sensitive ones (API keys).

**Preferred flow: set the flag on the test command.** Every `npx mgr test` invocation overwrites the shared state file with whatever flags it was called with, and the emulator follows live. This is the recommended pattern — start the emulator once with no flag, leave it running, control the mode from your test invocations.

```bash
# Recommended
npx mgr emulator                                # boots in normal mode
TEST_EXTENDED_MODE=true npx mgr test ...        # flips emulator to extended
npx mgr test ...                                 # flips emulator back to normal
```

**Also supported: set the flag on the emulator command.** This still works as a boot default — the emulator command writes the file with whatever it was started with, so the very first test run (before any `npx mgr test` overrides it) sees that mode. Useful if you want to inspect the emulator in a particular mode before firing any tests, or if you script the emulator boot from CI. Just know that the next test command overrides whatever you set here.

```bash
# Also works (boot default — overridden by next test command)
TEST_EXTENDED_MODE=true npx mgr emulator        # boots in extended mode
npx mgr test ...                                 # ← this still flips it back to normal
```

## Log Files

BEM CLI commands automatically save all output to log files in `<projectDir>/functions/` while still streaming to the console — co-located with firebase-tools' own `*-debug.log` files so everything can be grepped from one directory:
- **`functions/serve.log`** — Output from `npx mgr serve` (Firebase serve)
- **`functions/emulator.log`** — Full emulator output (Firebase emulator + Cloud Functions logs)
- **`functions/test.log`** — Test runner output (when running against an existing emulator)
- **`functions/logs.log`** — Cloud Function logs from `npx mgr logs:read` or `npx mgr logs:tail` (raw JSON for `read`, streaming text for `tail`)

When `npx mgr test` starts its own emulator, logs go to `emulator.log` (since it delegates to the emulator command). When running against an already-running emulator, logs go to `test.log`.

These files are overwritten on each run and are gitignored via `*.log`. Reset sentinels (`*.log.reset`), the watch trigger file, and `test-mode.json` live separately in `<projectDir>/.temp/` because they're transient internal signals with no debugging value.

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

## Test Types

> **The runner reads each file's `module.exports` object — it does NOT inject Mocha/Jest globals.** A test file that calls `describe`/`it`/`before`/`beforeEach`/`after` at top level throws `ReferenceError: beforeEach is not defined` and shows as `Failed to load`. There is no global `assert` either — use the `assert` passed into `run({ assert })`. Every test file MUST export one of the shapes below.

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
| `http` | HTTP client (`http.command()`, `http.as('admin').command()`) |
| `assert` | Assertion helpers (see below) |
| `accounts` | Test accounts `{ basic, admin, premium-active, ... }` |
| `firestore` | Direct DB access (`get`, `set`, `delete`, `exists`) |
| `state` | Shared state (suites only) |
| `waitFor` | Polling helper `waitFor(condition, timeout, interval)` |

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

## Key Test Files

| File | Purpose |
|------|---------|
| `src/test/runner.js` | Test runner |
| `test/` | BEM core tests |
| `src/test/utils/assertions.js` | Assert helpers |
| `src/test/utils/http-client.js` | HTTP client |
| `src/test/test-accounts.js` | Test account definitions |
