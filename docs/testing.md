# Testing

## Running Tests

```bash
# Option 1: Two terminals
npx mgr emulator  # Terminal 1 - keeps emulator running
npx mgr test      # Terminal 2 - runs tests

# Option 2: Single command (auto-starts emulator)
npx mgr test
```

## Log Files

BEM CLI commands automatically save all output to log files in `functions/` while still streaming to the console:
- **`functions/serve.log`** — Output from `npx mgr serve` (Firebase serve)
- **`functions/emulator.log`** — Full emulator output (Firebase emulator + Cloud Functions logs)
- **`functions/test.log`** — Test runner output (when running against an existing emulator)
- **`functions/logs.log`** — Cloud Function logs from `npx mgr logs:read` or `npx mgr logs:tail` (raw JSON for `read`, streaming text for `tail`)

When `npx mgr test` starts its own emulator, logs go to `emulator.log` (since it delegates to the emulator command). When running against an already-running emulator, logs go to `test.log`.

These files are overwritten on each run and are gitignored (`*.log`). Use them to search for errors, debug webhook pipelines, or review full function output after a test run.

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
