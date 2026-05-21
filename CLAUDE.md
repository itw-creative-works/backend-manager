# Backend Manager (BEM)

> **Note for contributors and Claude:** This file is the architectural overview — identity, top-level conventions, and a map to deep references. The **meat** (per-subsystem APIs, behavior tables, recipes) lives in `docs/<topic>.md`. When extending or adding content, write it in the matching `docs/*.md` file and cross-link from here — do NOT inline it. If a topic doesn't have a doc yet, create one. Goal: keep this file under 250 lines.

## Identity

Backend Manager (BEM) is a comprehensive framework for building modern Firebase Cloud Functions backends. Sister project to Electron Manager (EM), Browser Extension Manager (BXM), and Ultimate Jekyll Manager (UJM). Provides a single `Manager.init(exports, {...})` bootstrap that wires built-in functions (`bm_api`, auth events, cron jobs), helper classes (Assistant, User, Analytics, Usage, Middleware, Settings, Utilities, Metadata), payment processor integrations (Stripe / PayPal), Firestore-trigger pipelines, marketing campaign automation, an MCP server, and a CLI for emulator/deploy/logs/auth/Firestore operations.

**This repository** is the BEM library itself. **Consumer projects** are Firebase projects that `require('backend-manager')` in their `functions/index.js`, with `backend-manager-config.json` + `service-account.json` alongside, plus optional `routes/`, `schemas/`, and `hooks/` directories for custom endpoints.

## Recommended skills

- **`BEM:patterns`** — SSOT for Backend Manager routes, schemas, tests, Firebase functions, Firestore rules, usage tracking patterns. Auto-loads on BEM-specific keywords (`route`, `schema`, `endpoint`, `bm_api`, `Manager.init`, `npx mgr test`, `gcloud logs`, etc.) and when touching files in `functions/routes/`, `functions/schemas/`, `functions/index.js`, `test/`, `src/cli/commands/`.
- **`js:patterns`** — JavaScript/Node.js conventions: file structure, JSDoc, defensive coding (`?.` usage), template literals, `package.json` conventions. Auto-loads when creating new `.js` files or touching JS module structure.

## Quick Start

### For Consuming Projects

1. `npm install backend-manager --save-dev` (inside `functions/`)
2. `npx mgr setup` — validates config, scaffolds defaults (CLAUDE.md, CHANGELOG.md, docs/, test/), provisions Firestore indexes
3. `npx mgr emulator` — start Firebase emulators (auth/firestore/functions/database/storage)
4. `npx mgr serve` — local serve with Stripe webhook forwarding (if `STRIPE_SECRET_KEY` is set)
5. `npx mgr test` — runs framework + project test suites against an emulator
6. `npx mgr deploy` — deploy Cloud Functions to Firebase
7. `npx mgr logs:read` / `npx mgr logs:tail` — Cloud Function logs from Google Cloud Logging

All `npx mgr <cmd>` aliases work: `npx bm <cmd>`, `npx bem <cmd>`, `npx backend-manager <cmd>`.

> **Important:** All `npx mgr ...` commands MUST be run from the consumer project's `functions/` subdirectory. The binary lives in `functions/node_modules/.bin/`.

### For Framework Development (This Repository)

1. `npm install` — install BEM's own deps
2. `npm run prepare` — build once: copies `src/` → `dist/` via prepare-package
3. `npm run prepare:watch` — watch mode
4. Test in a consumer project: from inside the consumer's `functions/` dir, run `npx mgr install local` (swaps BEM to the local repo via the `install` CLI). Reverse with `npx mgr install prod`.

## Architecture

BEM exposes a single `Manager` class that orchestrates everything: it initializes Firebase Admin, wires built-in functions (`bm_api`, auth events, cron), and hands out helper instances via factory methods. Supports **two deployment modes** — Firebase Functions (`projectType: 'firebase'`) or Custom Server (`projectType: 'custom'`). See [docs/architecture.md](docs/architecture.md) for the full overview of the Manager class, dual-mode support, and helper factory pattern.

For the directory layout of both the BEM library and consumer projects, see [docs/directory-structure.md](docs/directory-structure.md).

## CLI

`npx mgr <command>` (aliases `bm`, `bem`, `backend-manager`):

| Command | Description |
|---|---|
| `setup` | Validate config, scaffold defaults (CLAUDE.md, CHANGELOG.md, docs/, test/), provision Firestore indexes |
| `emulator` | Start Firebase emulators (auth/firestore/functions/database/storage) |
| `serve` | Local Firebase serve (with auto Stripe webhook forwarding if keys set) |
| `watch` | Auto-reload functions on file change |
| `deploy` | Deploy Cloud Functions to Firebase |
| `test` | Run framework + project test suites against an emulator |
| `mcp` | Start the stdio MCP server (for Claude Code / Claude Desktop) |
| `firestore:get/set/query/delete` | Direct Firestore reads/writes from the terminal |
| `auth:get/list/delete/set-claims` | Manage Auth users from the terminal |
| `logs:read` / `logs:tail` | Cloud Function logs from Google Cloud Logging |
| `stripe` | Standalone Stripe CLI webhook forwarding |
| `indexes` | Sync required Firestore indexes into `firestore.indexes.json` |
| `firebase-init` | Run Firebase Admin SDK initialization helper |
| `clean` | Remove generated artifacts (logs, test outputs) |
| `version` | Print BEM version |

See [docs/cli-firestore-auth.md](docs/cli-firestore-auth.md) and [docs/cli-logs.md](docs/cli-logs.md) for full flag references.

## File Conventions

- **CommonJS** throughout. `prepare-package` copies `src/` → `dist/` 1:1 (no transforms).
- **`fs-jetpack`** over `fs` / `fs-extra` for file operations.
- One `module.exports = ...` per file.
- **Short-circuit early returns** rather than nested ifs.
- **Logical operators at the start of continuation lines** (`|| condB` on a new line, not `condA ||` trailing).
- **Firestore shorthand**: `admin.firestore().doc('users/abc123')` (path string) rather than `.collection('users').doc('abc123')`.
- **Template strings for requires**: `` require(`${functionsDir}/node_modules/backend-manager`) `` rather than string concat.
- **No backwards compatibility** unless explicitly requested.
- **Routes receive sanitized data by default** — see [docs/sanitization.md](docs/sanitization.md) for opt-out rules.
- **Match schema names to route names** — if route is `myEndpoint`, schema is `myEndpoint`.
- **Always use `assistant.respond()` for responses** — do NOT use `res.send()` directly.
- **Add Firestore composite indexes** for any compound query (`where` + `orderBy`, or multiple `where`s) to `src/cli/commands/setup-tests/helpers/required-indexes.js` (the SSOT). Without the index, queries crash with `FAILED_PRECONDITION` in production.

See [docs/code-patterns.md](docs/code-patterns.md) for code-pattern detail, [docs/common-mistakes.md](docs/common-mistakes.md) for the full anti-pattern checklist, and [docs/file-naming.md](docs/file-naming.md) for the naming table (routes / schemas / API commands / events / cron jobs / hooks).

## Doc-update parity

Whenever you make a behavioral change (new command, new flag, new pattern, removed feature), update:

1. **`README.md`** — user-facing summary
2. **`CLAUDE.md`** (this file) — architecture overview, one paragraph or cross-link
3. **`docs/<topic>.md`** — the meat. If a topic doesn't have a doc yet, create one.
4. **`CHANGELOG.md`** — if the project keeps one

Don't ship behavioral changes with stale docs. Validate first, then document — write docs that describe shipped reality, not intentions.

## Documentation

Deep references live in `docs/`. **Whenever you make a behavioral change, update both this overview AND the relevant `docs/*.md` deep reference.**

### Architecture & Conventions

- [docs/architecture.md](docs/architecture.md) — Manager class, dual-mode (firebase/custom), helper factory pattern
- [docs/directory-structure.md](docs/directory-structure.md) — BEM library + consumer project layouts
- [docs/code-patterns.md](docs/code-patterns.md) — short-circuit returns, logical operators on new lines, Firestore shorthand, template-string requires, fs-jetpack preference
- [docs/file-naming.md](docs/file-naming.md) — naming table for routes, schemas, API commands, events, cron jobs, hooks
- [docs/common-mistakes.md](docs/common-mistakes.md) — anti-pattern checklist (don't modify Manager internals, always await, increment-before-update, etc.)
- [docs/key-files.md](docs/key-files.md) — quick lookup for the most-touched files (Manager, helpers, auth events, cron, payment processors, CLI commands)
- [docs/environment-detection.md](docs/environment-detection.md) — `assistant.isDevelopment/isProduction/isTesting()`
- [docs/response-headers.md](docs/response-headers.md) — automatic `bm-properties` header

### Building Routes & Components

- [docs/routes.md](docs/routes.md) — recipes for new API commands, routes, event handlers, cron jobs (with code templates)
- [docs/schemas.md](docs/schemas.md) — schema definition format, defaults vs premium overrides
- [docs/sanitization.md](docs/sanitization.md) — automatic XSS sanitization, schema opt-out (`sanitize: false`), route-level opt-out, manual `utilities.sanitize()`
- [docs/auth-hooks.md](docs/auth-hooks.md) — consumer hooks for `before-create`/`before-signin`/`on-create`/`on-delete` (blocking + non-blocking examples)
- [docs/common-operations.md](docs/common-operations.md) — inside-the-handler patterns: authenticate, read/write Firestore, error handling, send response, `bm_api` hook

### Built-in Routes

- [docs/admin-post-route.md](docs/admin-post-route.md) — `POST/PUT /admin/post` blog creation via GitHub (image extraction + `@post/` rewriting)
- [docs/payment-system.md](docs/payment-system.md) — full payment pipeline: Intent → Webhook → On-Write → Transition; subscription model, statuses, `resolveSubscription()`, transition handlers, processor interface, product config, test processor
- [docs/marketing-campaigns.md](docs/marketing-campaigns.md) — campaign CRUD routes, recurring campaigns, generator pipeline (newsletter), template-owned schemas, asset hosting, seed campaigns
- [docs/consent.md](docs/consent.md) — marketing consent capture: canonical `consent.{legal,marketing}` user-doc shape, signup-form capture, account-page toggle, HMAC unsub link, SendGrid+Beehiiv webhook receivers, parent forwarder (`/marketing/webhook/forward`), migration script template
- [docs/mcp.md](docs/mcp.md) — Model Context Protocol server: 19 tools, stdio + HTTP transports, OAuth, Claude Chat/Code configuration

### Subsystems & Libraries

- [docs/usage-rate-limiting.md](docs/usage-rate-limiting.md) — usage tracking, monthly/daily caps, `setUser()` + mirrors for proxy usage, reset schedule
- [docs/ai-library.md](docs/ai-library.md) — `Manager.AI()` unified entry for OpenAI + Anthropic
- [docs/marketing-fields.md](docs/marketing-fields.md) — adding custom fields to SendGrid + Beehiiv via the BEM/OMEGA SSOT pair
- [docs/stripe-webhook-forwarding.md](docs/stripe-webhook-forwarding.md) — auto-started Stripe CLI forwarding for local dev

### Testing & CLI

- [docs/testing.md](docs/testing.md) — running, filtering, log files, test types (standalone/suite/group), context object, assertions, auth levels. **For Firestore/Auth/local state, cleanup runs at the START of every run, never at the end** — if you add a test that writes Firestore data, register the collection/namespace in the runner's pre-test wipe list, don't add a trailing cleanup step. **Exception:** third-party providers we can't wipe at start (e.g. SendGrid/Beehiiv contact lists) get a symmetric pre + post cleanup hook in the runner — see `cleanupMarketingProviders` and [docs/consent.md](docs/consent.md). Don't pattern-match this exception for new Firestore code.
- [docs/cli-firestore-auth.md](docs/cli-firestore-auth.md) — `npx mgr firestore:*` and `auth:*` commands, shared flags, examples
- [docs/cli-logs.md](docs/cli-logs.md) — `npx mgr logs:read` / `logs:tail` with full flag reference and built-in Cloud Function names
