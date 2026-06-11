# Project tests

Drop your project test suites here. The framework auto-runs them alongside its own when you run `npx mgr test`.

## Layout

Match the framework's layout — Backend Manager's test runner discovers files by the directory they sit in. Mirror the same per-area split as the framework's own `test/` (see `node_modules/backend-manager/test/`):

| Directory | Use for |
|---|---|
| `test/routes/` | Custom HTTP route handlers (`functions/routes/<verb>/<path>.js`) |
| `test/events/` | Pub/Sub / Firestore-trigger handlers |
| `test/helpers/` | Shared test utilities for your project |
| `test/fixtures/` | Static test data (JSON, sample docs) |
| `test/_init/` | Per-suite setup (Firestore seed data, user accounts) |

Tests run inside the Firebase emulator. Use the BEM helpers (`assistant`, admin SDK, fixture loaders) instead of mocking — `npx mgr emulator` boots the same environment the tests run against.

## Extended mode (real external APIs)

By default, tests skip REAL external services (SendGrid, OpenAI, Stripe webhooks, etc.) — the routes/libraries short-circuit in-source when not in extended mode. To exercise those paths for real, pass `--extended`:

```bash
npx mgr test --extended            # opt into real external APIs
TEST_EXTENDED_MODE=true npx mgr test   # identical — the env-var form
```

`--extended` is the CLI shorthand for the shared, unprefixed `TEST_EXTENDED_MODE` env var standardized across BEM/BXM/UJM/EM. BEM propagates it to BOTH the test runner and the running emulator, so a single flag on the test command flips everything — no need to restart the emulator. Anything an extended test creates in an external system MUST be cleaned up by the test (the runner only wipes local Firestore/Auth).

## Coverage

Every feature ships with tests at every surface it exposes — logic (handler suites), wiring (route round-trips over `http.as(...)`), and rules (when Firestore rules change). Skip a surface only when the feature genuinely doesn't have one; "the handler test covers it" does not excuse the route round-trip.

## Quick example

```js
// test/routes/hello.test.js
module.exports = {
  'GET /hello returns ok': async ({ http }) => {
    const res = await http.get('hello');
    if (res.status !== 200) throw new Error('expected 200');
  },
};
```

## See also

The framework's own test suites at `node_modules/backend-manager/test/` are the canonical reference for how each layer is structured.
