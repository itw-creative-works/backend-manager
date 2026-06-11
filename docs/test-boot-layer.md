# Test Framework — Boot Layer

The `boot` layer is BEM's framework self-test. When `npx mgr test` runs from the backend-manager repo itself (no `firebase.json` in cwd), the runner boots a **bundled fixture Firebase project**, brings up the emulator against it, and runs the `test/boot/` smoke suite. It replaces the old "you can't run tests from the framework repo" gap with a deterministic pass/fail. BEM's equivalent of BXM's `BXM_TEST_BOOT_PROJECT` boot layer and UJM's `UJ_TEST_BOOT_PROJECT` site-boot layer.

## What boot tests verify

Things that ONLY break when the whole self-test path assembles correctly:
- The Firebase emulator boots against the fixture (functions, firestore, auth, hosting, …)
- The fixture's `functions/index.js` runs `Manager.init()` inside the emulator's functions runtime — i.e. the **local** `backend-manager` (symlinked in) loads and wires the built-in `bm_api` function
- The hosting rewrite routes `/backend-manager/**` → `bm_api`
- A health request returns `200` with the fixture's `projectId` (`demo-backend-manager`) and the live `bemVersion`

If the boot smoke passes, the framework at minimum *boots a consumer backend end-to-end* — catching a class of integration breaks (broken `Manager.init`, mis-wired `bm_api`, bad hosting rewrites) that no single handler test covers.

## Test file shape

Same `{ description, type, tests }` contract as every other BEM suite — the boot suite is just scoped to the `test/boot/` directory and gated to self-test runs:

```js
module.exports = {
  description: 'Boot smoke — fixture emulator + bm_api reachable',
  type: 'group',
  timeout: 30000,
  tests: [
    {
      name: 'bm_api-health-responds-over-hosting-rewrite',
      async run({ http, assert }) {
        const response = await http.get('backend-manager/test/health');
        assert.isSuccess(response, 'bm_api /test/health should respond through the emulator');
      },
    },
  ],
};
```

## The bundled fixture project

`src/test/fixtures/firebase-project/` — a minimal, committed BEM consumer backend:

- `firebase.json` + `.firebaserc` — a **`demo-` project** (`demo-backend-manager`) so the emulator NEVER touches real Firebase; emulator ports from `DEFAULT_EMULATOR_PORTS`; hosting rewrite to `bm_api`.
- `functions/index.js` — the one-line `Manager.init()` bootstrap (mirrors a real consumer).
- `functions/package.json` + `backend-manager-config.json` — fake brand/config (no real secrets).
- `firestore.rules` / `storage.rules` / `database.rules.json` / `firestore.indexes.json` — minimal locked rules (`bm_api` uses the Admin SDK, which bypasses rules).

**Runtime-only, gitignored** (never committed): before boot, the test command symlinks the local `backend-manager` (+ `firebase-admin`/`firebase-functions` from BEM's own `node_modules`) into the fixture's `functions/node_modules`, injects the fixture admin keys into the env, and generates a **throwaway RSA `service-account.json`** (emulator-only — a `demo-` project never authenticates against Google). All of this lives in `setupSelfTest()` / `linkFixtureDeps()` / `ensureFixtureServiceAccount()` in [src/cli/commands/test.js](../src/cli/commands/test.js).

Two packaging details keep the fixture sound: the fixture's `.firebaserc` is **re-included over the repo's global `.firebaserc` ignore** (the emulator boots with no `--project` flag, so it resolves `demo-backend-manager` from that file — a fresh clone needs it), and a `prepublishOnly` script **removes the runtime symlinks before `npm publish`** (the `backend-manager` symlink points back at the repo root, which would loop prepare-package's publish-time tree walk; the next self-test run relinks them).

## `BEM_TEST_BOOT_PROJECT`

| Env | Purpose |
|---|---|
| `BEM_TEST_BOOT_PROJECT` | Root of a Firebase project to boot instead of the bundled fixture. Auto-set to `src/test/fixtures/firebase-project` when BEM tests itself; set it explicitly to self-test against a **real consumer** (e.g. `ultimate-jekyll-backend`) without `cd`-ing into it. |

## What happens in a consumer run

The `boot/` smoke is **excluded from real-consumer runs** (`runner.js` `discoverTests` skips `boot/` unless `isFrameworkSelfTest`) — it targets the bundled fixture, so it would be redundant noise in a consumer's suite. Consumers run the full `routes`/`events`/`rules` suites against their own emulator as normal.

## Why this exists

BEM has no pure-logic test layer — every `routes`/`events`/`rules` suite needs a live emulator + a real project, so they run against a real consumer. The boot layer fills the remaining gap: a fast, self-contained smoke proving the framework still boots a consumer backend from the repo itself. It's the BEM analog of "does the extension load?" (BXM) / "does the site boot?" (UJM).

## See also

- [test-framework.md](test-framework.md) — overall harness, running/filtering, context object, assertions, auth levels
- [logging.md](logging.md) — `functions/*.log` files (the emulator/test logs the boot run writes)
- [environment-detection.md](environment-detection.md) — `Manager.isTesting()` and the environment signals
