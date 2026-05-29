# ========== Default Values ==========
# Backend Manager (BEM) — consumer project

## Framework

This project consumes **Backend Manager** (BEM) — a comprehensive framework for building modern Firebase Cloud Functions backends. BEM provides a single `Manager.init(exports, {...})` bootstrap that wires built-in functions (`bm_api`, auth events, cron jobs), helper classes (Assistant, User, Analytics, Usage, Middleware, Settings, Utilities, Metadata), payment processor integrations (Stripe / PayPal), Firestore-trigger pipelines, and a deploy/emulator/watch tooling pipeline.

## 🚨 READ THE FRAMEWORK DOCS FIRST

**Before doing ANY work on this codebase, Claude MUST read the framework documentation — that is where the architecture, conventions, APIs, and gotchas live. Skipping these will result in solutions that conflict with framework patterns.**

**Required reading:**
- **`node_modules/backend-manager/CLAUDE.md`** — full framework reference (single comprehensive file; not yet split into per-subsystem docs)

## Quick start

```bash
cd functions
npx mgr setup             # validate config + scaffold defaults + run checks
npx mgr emulator          # start Firebase emulators (auth/firestore/functions/database/storage)
npx mgr watch             # auto-reload functions on file change
npx mgr deploy            # deploy to Firebase
npx mgr logs:read         # read Cloud Functions logs (also: logs:tail to stream)
npx mgr firestore:get     # read a doc from Firestore (also: firestore:set / :query / :delete)
npx mgr auth:get          # read an Auth user (also: auth:list / :delete / :set-claims)
npx mgr install dev       # use LOCAL backend-manager source (to test framework edits)
npx mgr install prod      # restore the published backend-manager from npm
```

All `npx mgr <cmd>` aliases — `npx bm <cmd>`, `npx bem <cmd>`, `npx backend-manager <cmd>` work too.

> Editing the BEM framework source while working here? Run `npx mgr install dev` so this project picks up your uncommitted framework changes (it otherwise uses its installed `node_modules/backend-manager`). Run `npx mgr install prod` to switch back.

## Where things live

- `functions/index.js` — entry point. Must call `Manager.init(exports, { ... })` to register all built-in + custom endpoints.
- `functions/backend-manager-config.json` — BEM config: brand, projectType (`firebase` or `custom`), feature flags, rate limits, hooks.
- `functions/.env` — secrets (BACKEND_MANAGER_KEY, third-party API keys). Gitignored.
- `functions/service-account.json` — Firebase Admin credentials. Gitignored.
- `functions/routes/<verb>/<path>.js` — custom routes mounted at runtime (e.g. `routes/get/hello.js` → `GET /hello`).
- `functions/schemas/<name>.js` — schema definitions for `Manager.Settings()` validation.
- `firebase.json` — Firebase config (hosting, rewrites, emulator ports). Some fields managed by `npx mgr setup`.
- `.firebaserc` — Firebase project ID alias.
- `firestore.rules` / `database.rules.json` — security rules. BEM owns a `///---backend-manager---///` block inside each; everything outside is yours.

## Per-context imports

```js
// functions/index.js — the entire backend bootstrap
const Manager = require('backend-manager');
Manager.init(exports, {
  projectType: 'firebase',
  // ...your config
});

// In a custom route (functions/routes/get/hello.js):
module.exports = async function(Manager, assistant) {
  // assistant.req, assistant.res, assistant.user, etc.
};
```

## Available APIs at runtime

After `Manager.init()`, the Manager instance exposes factory methods:
- `Manager.Assistant({ req, res })` — request handler with user + analytics + utility access
- `Manager.User(data)` — user property structure + schema
- `Manager.Analytics({ assistant })` — GA4 event tracking
- `Manager.Usage()` — rate-limiting
- `Manager.Middleware(req, res)` — request pipeline
- `Manager.Settings()` — schema validation against `functions/schemas/*`
- `Manager.Utilities()` — batch operations + helpers
- `Manager.Metadata(doc)` — timestamps + tag helpers
- `Manager.storage({ name })` — local JSON storage (lowdb)

Auth events, payment-webhook transitions, and cron jobs are wired automatically — hook into them by exporting from `functions/hooks/<area>/<event>.js`.

<!-- Everything above this marker is owned by the framework and rewritten on every `npx mgr setup`. Add your project-specific notes below — they are preserved across setups. -->

# ========== Custom Values ==========

## Project-specific notes

Add anything specific to THIS project here. Edits below this line are preserved across `npx mgr setup` runs.
