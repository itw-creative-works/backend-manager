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
