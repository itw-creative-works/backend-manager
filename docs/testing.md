# Testing

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
2. **`users/_test-*`** Firebase Auth users + Firestore docs (delete).
3. **Mixed Firestore collections** — `payments-orders`, `payments-webhooks`, `payments-intents`, `payments-disputes`, `marketing-webhooks`. Two-pass cleanup per collection:
   - Pass 1 — owner-keyed: `where('owner', 'in', [...testUids])` (batched at 30 uids per `in` query).
   - Pass 2 — id-keyed: any doc whose ID starts with `_test-` (catches ownerless test docs like dispute alerts and raw test webhooks).
4. **Test-only Firestore collections** — `_test`, `_test_query` — wiped in full.
5. **Realtime Database** — the `_test` namespace removed in full (`admin.database().ref('_test').remove()`).

### Marketing-provider cleanup

Test signups never reach SendGrid + Beehiiv. The validation pipeline (`src/manager/libraries/email/validation.js`) blocks all `_test.*` emails at the marketing-library layer via the `/^_test\.(?!allow_)/` pattern in `blocked-local-patterns.js`.

The single exception is the `_test.allow_*` prefix. Two long-lived test accounts (`_test.allow_consent-granted@...` and `_test.allow_consent-declined@...`) intentionally round-trip through SendGrid + Beehiiv as the live-provider integration sentinels. They are exercised by `test/marketing/consent-lifecycle.js`, which manages its own setup, assertions, and teardown.

All cleanup follows the start-only rule. No trailing-cleanup exception.

### When adding a new test that writes data

| If your test writes to... | Then... |
|---|---|
| A new Firestore collection (mixed test + prod data) | Add the collection name to `testDataCollections` in `src/test/test-accounts.js`. |
| A new Firestore collection (test-only data) | Add it to `testOnlyCollections` in `src/test/test-accounts.js`. |
| Realtime Database | Use a path under `_test/...` — already wiped pre-test. |
| Anywhere else | Use the `_test-` doc-id prefix so id-keyed pass-2 catches it. |

### Within-run state isolation is different

Per-test cleanup is still appropriate when a test sets up DB state that would pollute a **later test in the same run** — e.g. trial-eligibility's `try/finally` that removes the fake `payments-orders/_test-trial-eligibility-*` doc so the next sibling test sees a clean slate. Those stay in the test. They are *intra-run* state management, not *next-run* cleanup, and the distinction matters.

The rule: **never put cleanup at the END of a test file or suite for the purpose of preparing the next run** — for LOCAL state. If a test cleans up local Firestore/Auth data only to "leave no trace," that cleanup belongs in the runner's pre-test phase instead. Add the collection/namespace to the runner's wipe list and remove the trailing cleanup step. The third-party provider exception (see above) lives in the runner's post-suite hook, not in individual tests.

## Extended Mode (`TEST_EXTENDED_MODE`)

Several routes/handlers skip external API calls (SendGrid, Beehiiv, Stripe webhooks, dispute handlers, marketing libraries) when `process.env.TEST_EXTENDED_MODE` is unset, so unit tests don't fire real emails or webhook side effects. Set the flag to opt **in** to those side effects for a full end-to-end run.

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

- **BEM core tests:** `test/`
- **Project tests:** `functions/test/bem/`

Use `bem:` or `project:` prefix to filter by source.

## Test Types

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
