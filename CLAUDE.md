# Backend Manager (BEM)

> **Note for contributors and Claude:** This file is the architectural overview — identity, top-level conventions, and a map to deep references. The **meat** (per-subsystem APIs, behavior tables, recipes) lives in `docs/<topic>.md`. When extending or adding content, write it in the matching `docs/*.md` file and cross-link from here — do NOT inline it. If a topic doesn't have a doc yet, create one. Goal: keep this file under 250 lines.

> **Mirrored structure:** BEM, UJM, BXM, and EM CLAUDE.md files mirror each other — shared sections (Supply-Chain Security, Development Workflow, File Conventions, etc.) appear in the **same order at the same position** across all four. When adding a section that applies to multiple frameworks, insert it in the same spot in all of them.

## Identity

Backend Manager (BEM) is a comprehensive framework for building modern Firebase Cloud Functions backends. Sister project to Electron Manager (EM), Browser Extension Manager (BXM), and Ultimate Jekyll Manager (UJM). Provides a single `Manager.init(exports, {...})` bootstrap that wires built-in functions (`bm_api`, auth events, cron jobs), helper classes (Assistant, User, Analytics, Usage, Middleware, Settings, Utilities, Metadata), payment processor integrations (Stripe / PayPal), Firestore-trigger pipelines, marketing campaign automation, an MCP server, and a CLI for emulator/deploy/logs/auth/Firestore operations.

**This repository** is the BEM library itself. **Consumer projects** are Firebase projects that `require('backend-manager')` in their `functions/index.js`, with `backend-manager-config.json` + `service-account.json` alongside, plus optional `routes/`, `schemas/`, and `hooks/` directories for custom endpoints.

## Recommended skills

- **`omega:bem`** — router skill. Auto-loads on BEM-specific keywords (`route`, `schema`, `endpoint`, `bm_api`, `Manager.init`, `npx mgr test`, `gcloud logs`, etc.) and points back to this CLAUDE.md + `docs/` (the SSOT), carrying only Claude-workflow hard rules and process checklists.
- **`js:patterns`** — JavaScript/Node.js conventions: file structure, JSDoc, defensive coding (`?.` usage), template literals, `package.json` conventions. Auto-loads when creating new `.js` files or touching JS module structure.

## Quick Start

### For Consuming Projects

1. `npm install backend-manager --save-dev` (inside `functions/`)
2. `npx mgr setup` — bootstraps a new project (scaffolds `.firebaserc`, `firebase.json`, `backend-manager-config.json`, `engines.node`, CLAUDE.md, CHANGELOG.md, docs/, test/), validates config, provisions Firestore indexes
3. `npx mgr emulator` — start Firebase emulators (auth/firestore/functions/database/storage)
4. `npx mgr serve` — local serve with Stripe webhook forwarding (if `STRIPE_SECRET_KEY` is set)
5. `npx mgr test` — runs framework + project test suites against an emulator. Positional target(s) select which test FILES run, by source + path (multiple space-separated targets compose):
   - `npx mgr test` — everything (framework + project suites)
   - `npx mgr test email/transactional` — bare path (no prefix): both sources, matched by path (relative to `test/`)
   - `npx mgr test mgr:` / `npx mgr test bem:` — ONLY framework tests (`mgr:` is the universal cross-framework alias for the manager's own tests; `bem:` is the equivalent BEM-specific alias)
   - `npx mgr test mgr:email/templates` / `npx mgr test bem:email/templates` — only framework tests matching a path
   - `npx mgr test project:` — ONLY project tests (all of them)
   - `npx mgr test project:routes/custom` — only consumer project tests matching a path
   - `npx mgr test bem:rules project:routes` — multiple targets compose (runs both selections)
   - Pass `--extended` (or prefix `TEST_EXTENDED_MODE=true`) for tests that hit real external APIs (SendGrid, OpenAI, etc.). `--extended` is the CLI shorthand for the shared, unprefixed `TEST_EXTENDED_MODE` env var standardized across BEM/BXM/UJM/EM; BEM propagates it to BOTH the runner subprocess and the live emulator. See [docs/test-framework.md](docs/test-framework.md#extended-mode-test_extended_mode).
6. `npx mgr deploy` — deploy Cloud Functions to Firebase
7. `npx mgr logs:read` / `npx mgr logs:tail` — Cloud Function logs from Google Cloud Logging

All `npx mgr <cmd>` aliases work: `npx bm <cmd>`, `npx bem <cmd>`, `npx backend-manager <cmd>`.

> **Important:** All `npx mgr ...` commands MUST be run from the consumer project's `functions/` subdirectory. The binary lives in `functions/node_modules/.bin/`.

### For Framework Development (This Repository)

1. `npm install` — install BEM's own deps
2. `npm run prepare` — build once: copies `src/` → `dist/` via prepare-package
3. `npm run prepare:watch` — watch mode
4. Test in the **designated test consumer** — `../ultimate-jekyll-backend` is BEM's consumer for validating framework changes end-to-end (exercise any consumer-level flow there freely: emulator, tests, deploy paths). From inside it, run `npx mgr install dev` to swap BEM to this local repo — required whenever you edit the framework source and want the consumer to pick up the changes (the consumer otherwise keeps its installed `node_modules/backend-manager`). Reverse with `npx mgr install live`. If `npx mgr` then errors with "could not determine executable to run", the local install skipped bin-linking — re-run `npm install` to relink, or call `node node_modules/backend-manager/bin/backend-manager <cmd>` directly.

## Architecture

BEM exposes a single `Manager` class that orchestrates everything: it initializes Firebase Admin, wires built-in functions (`bm_api`, auth events, cron), and hands out helper instances via factory methods. Supports **two deployment modes** — Firebase Functions (`projectType: 'firebase'`) or Custom Server (`projectType: 'custom'`). See [docs/architecture.md](docs/architecture.md) for the full overview of the Manager class, dual-mode support, and helper factory pattern.

For the directory layout of both the BEM library and consumer projects, see [docs/directory-structure.md](docs/directory-structure.md).

### Test framework

`npx mgr test` runs framework + project suites against a **real Firebase emulator** (real Firestore/Auth — never mocked). Suites are organized by concern (`test/routes/`, `test/events/`, `test/rules/`, …) rather than runtime layers. See [docs/test-framework.md](docs/test-framework.md).

### Test coverage

Every feature ships with tests at EVERY surface it exposes — logic (`test/routes/`/`test/events/` handler suites against the real emulator), wiring (route round-trips over `http.as(...)` — registration, auth gates, schema validation; this IS BEM's end-to-end), and rules (Firestore security-rules suites when rules change). BEM has no UI layer — a feature's UI coverage lives in the consuming frontend (UJM/BXM/EM). Skip a surface ONLY when the feature genuinely doesn't have one; "the handler test already covers it" is NOT a reason to skip the route round-trip. See [docs/test-framework.md](docs/test-framework.md).

## CLI

`npx mgr <command>` (aliases `bm`, `bem`, `backend-manager`):

| Command | Description |
|---|---|
| `setup` | Bootstrap new projects (scaffolds config files + doc defaults), validate config, provision Firestore indexes |
| `emulator` | Start Firebase emulators (auth/firestore/functions/database/storage) |
| `serve` | Local Firebase serve (with auto Stripe webhook forwarding if keys set) |
| `watch` | Auto-reload functions on file change |
| `deploy` | Deploy Cloud Functions to Firebase |
| `test` | Run framework + project test suites against an emulator |
| `mcp` | Start the stdio MCP server (for Claude Code / Claude Desktop). Supports `--token <key>` for user-level connections |
| `firestore:get/set/query/delete` | Direct Firestore reads/writes from the terminal |
| `auth:get/list/delete/set-claims` | Manage Auth users from the terminal |
| `logs:read` / `logs:tail` | Cloud Function logs from Google Cloud Logging |
| `stripe` | Standalone Stripe CLI webhook forwarding |
| `indexes` | Sync required Firestore indexes into `firestore.indexes.json` |
| `firebase-init` | Run Firebase Admin SDK initialization helper |
| `clean` | Remove generated artifacts (logs, test outputs) |
| `version` | Print BEM version |

See [docs/cli-firestore-auth.md](docs/cli-firestore-auth.md) and [docs/cli-logs.md](docs/cli-logs.md) for full flag references.

## Dependency Resolution

- **Consumer code can use `Manager.require(name)`** to load any BEM dependency from BEM's own module context (static + prototype). Consumer projects do NOT need to install BEM's transitive deps directly.
- **web-manager owns Firebase on the client side.** Consumer frontend code (UJM pages, BXM popup/options, EM renderers) NEVER imports Firebase directly — `firebase.firestore()` → `webManager.firestore()`, `firebase.auth()` → `webManager.auth()`. BEM backend code uses `firebase-admin` directly (server-side is different). The three frontend frameworks (EM/BXM/UJM) additionally resolve deps via webpack `resolve.modules`.

## Development Workflow

- **🚫 NEVER run `npx mgr serve` / `npx mgr emulator`** — they're the user's long-running dev processes. Assume they're already running; if they aren't, **instruct the user to run them** rather than running them yourself (running them again kills theirs). To see output, **read the `functions/*.log` files** (`dev.log`, `emulator.log`, `test.log`) — never tail/attach to the process. Running `npx mgr test` is fine (it auto-starts its own emulator if needed).
- **Where the output logs live:** BEM CLI commands tee output to `<projectDir>/functions/` (not `logs/` — BEM's deliberate exception, co-located with firebase-tools' `*-debug.log`): `dev.log` (`npx mgr serve`), `deploy.log` (`npx mgr deploy`), `emulator.log` (`npx mgr emulator` / test with own emulator), `test.log` (`npx mgr test`), `production.log` (`npx mgr logs`). The `dev`/`test` names match EM/BXM/UJM; see [docs/logging.md](docs/logging.md).
- **If the user reports an error**, check the emulator/test output for the root cause before guessing.
- **Live-test UI changes via CDP.** When working on admin dashboards or browser-facing endpoints, use the `chrome-devtools` MCP tools (screenshots, click, evaluate JS, console logs) to verify the change works in the running browser. See `~/.claude/mcp-server/servers/chrome-devtools/CLAUDE.md`.

## Supply-Chain Security

All `npm install` calls in CLI commands (`npx mgr i`, `npx mgr setup`, setup-tests) route through the `safeInstall()` helper (`src/cli/utils/safe-install.js`). It prefixes `sfw` (Socket Firewall) when installed — blocking confirmed malware at the network level before packages reach disk. Falls back to plain npm if sfw isn't available. CI workflows install sfw globally and run `sfw npm install`/`sfw npm ci`. Installs will **fail if sfw detects confirmed malware** in any package in the dependency tree; non-critical CVEs and quality warnings pass through.

## File Conventions

- **CommonJS** throughout. `prepare-package` copies `src/` → `dist/` 1:1 (no transforms).
- **`fs-jetpack`** over `fs` / `fs-extra` for file operations.
- One `module.exports = ...` per file.
- **Short-circuit early returns** rather than nested ifs.
- **Logical operators at the start of continuation lines** (`|| condB` on a new line, not `condA ||` trailing).
- **Firestore shorthand**: `admin.firestore().doc('users/abc123')` (path string) rather than `.collection('users').doc('abc123')`.
- **Template strings for requires**: `` require(`${functionsDir}/node_modules/backend-manager`) `` rather than string concat.
- **No backwards compatibility** unless explicitly requested.
- **Routes receive whitespace-trimmed data; HTML is preserved.** Sanitize at the HTML-insertion site via `utilities.sanitize()`. Opt into middleware-level HTML strip per-route with `{ sanitize: true }`. See [docs/sanitization.md](docs/sanitization.md).
- **Match schema names to route names** — if route is `myEndpoint`, schema is `myEndpoint`.
- **Always use `assistant.respond()` for responses** — do NOT use `res.send()` directly.
- **Always use `Manager.getApiUrl()` for the API URL** — never read the cached `Manager.project.apiUrl` property. The getter is the SSOT and auto-resolves to the local emulator in dev AND test (and production otherwise), so it's safe everywhere without passing an env arg. See [docs/environment-detection.md](docs/environment-detection.md).
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
- [docs/build-system.md](docs/build-system.md) — no consumer build (deliberate outlier), framework prepare-package, deploy pipeline
- [docs/code-patterns.md](docs/code-patterns.md) — short-circuit returns, logical operators on new lines, Firestore shorthand, template-string requires, fs-jetpack preference
- [docs/file-naming.md](docs/file-naming.md) — naming table for routes, schemas, API commands, events, cron jobs, hooks
- [docs/common-mistakes.md](docs/common-mistakes.md) — anti-pattern checklist (don't modify Manager internals, always await, increment-before-update, etc.)
- [docs/audit.md](docs/audit.md) — full-audit check catalog (U-xx universal / BEM-xx / F-xx IDs with severity + scope), protocol + fix loop
- [docs/cdp-debugging.md](docs/cdp-debugging.md) — launching a controllable Chrome (CDP) to verify the frontend against your routes (network payloads, auth'd flows via the persistent agent profile)
- [docs/key-files.md](docs/key-files.md) — quick lookup for the most-touched files (Manager, helpers, auth events, cron, payment processors, CLI commands)
- [docs/cli-output.md](docs/cli-output.md) — shared CLI styling module (`src/cli/utils/ui.js`): OMEGA-style banner/dividers/sections/status symbols + the `Summary` block (pass/warn/fail); setup check return types (`true`/`false`/`Error`/`'warn'`); used by `setup`, adoptable by other commands
- [docs/environment-detection.md](docs/environment-detection.md) — `getEnvironment()` returns `'development' | 'testing' | 'production'` (mutually exclusive); gate side effects on the INTENTIONAL check (`isProduction()` for prod-only, `isDevelopment() || isTesting()` for local-or-test) — never `!isDevelopment()`. Plus the URL helper convention (always `Manager.getApiUrl()` — auto-resolves local in dev+test, never read `project.apiUrl`)
- [docs/response-headers.md](docs/response-headers.md) — automatic `bm-properties` header

### Building Routes & Components

- [docs/routes.md](docs/routes.md) — recipes for new API commands, routes (context-object handlers, CRUD method files, ownership checks, firebase.json rewrites + ordering, functions/index.js entry), event handlers, cron jobs
- [docs/schemas.md](docs/schemas.md) — schema contract (context object → flat schema, in-function plan branching), field properties, ID generation + path extraction, required-vs-default footgun
- [docs/firestore.md](docs/firestore.md) — path style, NO subcollections, batch reads (~500 cursor pagination), `metadata.{created,updated}` timestamps, response format + redaction
- [docs/migration.md](docs/migration.md) — legacy-project migration: runtime config → top-level env vars, `Manager.config.*` → `process.env.*`, constructor routes / tiered schemas → current format
- [docs/sanitization.md](docs/sanitization.md) — middleware trim-only default; opt-in HTML strip (`{ sanitize: true }`) with per-field opt-out (`sanitize: false`); manual `utilities.sanitize()` for HTML-insertion sites
- [docs/auth-hooks.md](docs/auth-hooks.md) — consumer hooks for `before-create`/`before-signin`/`on-create`/`on-delete` (blocking + non-blocking examples)
- [docs/common-operations.md](docs/common-operations.md) — inside-the-handler patterns: authenticate, read/write Firestore, error handling, send response, `bm_api` hook

### Built-in Routes

- [docs/admin-post-route.md](docs/admin-post-route.md) — `POST/PUT /admin/post` blog creation via GitHub (image extraction + resize at ingest + `@post/` rewriting). Also the publish target for the Ghostii article engine (`libraries/content/ghostii.js`).
- [docs/payment-system.md](docs/payment-system.md) — full payment pipeline: Intent → Webhook → On-Write → Transition; subscription model, statuses, `resolveSubscription()`, transition handlers, processor interface, product config, test processor
- [docs/marketing-campaigns.md](docs/marketing-campaigns.md) — campaign CRUD routes, recurring campaigns, generator pipeline (newsletter), newsletter-driven blog article (`content.article.enabled`), template-owned schemas, asset hosting, seed campaigns
- [docs/consent.md](docs/consent.md) — marketing consent capture: canonical `consent.{legal,marketing}` user-doc shape, signup-form capture, account-page toggle, HMAC unsub link (cross-provider unsub + re-add on resubscribe), admin contact-DELETE revoke mirror, SendGrid+Beehiiv webhook receivers, parent forwarder (`/marketing/webhook/forward`), library-level consent gate in `email.add()`/`email.sync()` (revoked-only skip), migration script template
- [docs/mcp.md](docs/mcp.md) — Model Context Protocol server: 25 tools with role-based scoping (22 admin / 2 user / 1 public), tool annotations (title, read/write hints), OAuth 2.1 with PKCE + dynamic client registration + consumer website sign-in, consumer MCP tools (`functions/mcp.js`), HTTPS local dev (mkcert), Claude Desktop/Chat/Code configuration

### Subsystems & Libraries

- [docs/ghostii.md](docs/ghostii.md) — Blog auto-publisher (Ghostii provider): source types (`$brand` / `$feed:` / `$parent` / URL / text), provider-based architecture, per-entry API overrides, RSS/Atom feed parser, unified `content-sources` Firestore tracking, `sourceContent` pass-through to Ghostii API
- [docs/email-system.md](docs/email-system.md) — unified MJML email rendering pipeline: shared preparation (`prepare.js`), composable template system (`base.js` blocks), 4 email templates (card, plain, order, feedback), no SendGrid dynamic templates — everything rendered server-side
- [docs/usage-rate-limiting.md](docs/usage-rate-limiting.md) — usage tracking, monthly/daily caps, `setUser()` + mirrors for proxy usage, reset schedule
- [docs/ai-library.md](docs/ai-library.md) — `Manager.AI()` unified entry for OpenAI + Anthropic (text via `.request()`, images via `.image()` → `gpt-image-2`)
- [docs/marketing-fields.md](docs/marketing-fields.md) — adding custom fields to SendGrid + Beehiiv via the BEM/OMEGA SSOT pair
- [docs/stripe-webhook-forwarding.md](docs/stripe-webhook-forwarding.md) — auto-started Stripe CLI forwarding for local dev

### Testing & CLI

- [docs/test-framework.md](docs/test-framework.md) — running, filtering, log files, test types (standalone/suite/group), context object, assertions, auth levels. **NEVER mock — test against the real emulator.** No `mockManager`/`mockAdmin`/fake `firestore`/stubbed `assistant`; every `run()` gets the real `Manager`/`assistant`/`firestore`/`http`/`accounts` — use them. Pure functions (zero I/O) are the only thing you call directly; anything touching Firestore or an external API runs for real. Real external APIs (OpenAI/PayPal/GitHub/SendGrid/Stripe) are gated behind `TEST_EXTENDED_MODE` in-source (not mocked) — opt in with `--extended` or `TEST_EXTENDED_MODE=true` (shared, unprefixed across BEM/BXM/UJM/EM; propagates to BOTH runner + emulator) — and anything an extended test creates externally must be cleaned up by the test. **Each test file `module.exports` a `{ description, type, tests }` object — NOT raw Mocha (`describe`/`it`/`beforeEach`); those globals are not injected and the file fails to load. Split tests one-file-per-concern under `test/<area>/`, never one giant `test/test.js`.** **All cleanup runs at the START of every run, never at the end** — the runner flushes the ENTIRE emulator Firestore before every run, so there's nothing to register; seed any needed fixtures in `test/_init.js`'s `setup()`, and never add a trailing cleanup step. Marketing providers (SendGrid/Beehiiv) don't need a special exception — `_test.*` emails are blocked at the validation layer so test signups never reach providers. The `_test.allow_*` carve-out exists only for the live-provider lifecycle test (`test/marketing/consent-lifecycle.js`), which manages its own teardown.
- [docs/test-boot-layer.md](docs/test-boot-layer.md) — the `boot/` smoke layer: framework self-test from the repo via the bundled fixture project + `BEM_TEST_BOOT_PROJECT` (BEM's analog of BXM/UJM `*_TEST_BOOT_PROJECT`)
- [docs/cli-firestore-auth.md](docs/cli-firestore-auth.md) — `npx mgr firestore:*` and `auth:*` commands, shared flags, examples
- [docs/cli-logs.md](docs/cli-logs.md) — `npx mgr logs:read` / `logs:tail` with full flag reference and built-in Cloud Function names
- [docs/logging.md](docs/logging.md) — `functions/*.log` file table (the `functions/` location exception), `production.log`
