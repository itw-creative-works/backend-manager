# CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## Changelog Categories

- `BREAKING` for breaking changes.
- `Added` for new features.
- `Changed` for changes in existing functionality.
- `Deprecated` for soon-to-be removed features.
- `Removed` for now removed features.
- `Fixed` for any bug fixes.
- `Security` in case of vulnerabilities.

# [5.7.6] - 2026-06-18

### Fixed
- **MCP admin role promotion.** Users with `roles.admin=true` on their Firestore doc now see all 25 admin tools when connecting via OAuth. Previously only the `BACKEND_MANAGER_KEY` granted admin MCP access; user-role admins were limited to 3 tools.

# [5.7.4] - 2026-06-18

### Added
- **Gitignore root proxy artifacts.** Default `.gitignore` template now excludes `/package.json` and `/package-lock.json` at the repo root, so the setup-generated root proxy and any lockfile are not tracked.

# [5.7.3] - 2026-06-18

### Changed
- **Root proxy preinstall forwards to functions/.** `npm install` at the project root now runs `cd functions && npm install` (forwarding deps to where they live) instead of just rejecting. Still exits 1 afterward to prevent npm from creating root-level artifacts.

# [5.7.2] - 2026-06-18

### Fixed
- **Newsletter generation crash.** v5.5.0 refactored `marketing.beehiiv` → `marketing.newsletter` but missed renaming `beehiivConfig` at 3 sites in `newsletter.js` (lines 331, 336, 340). The `ReferenceError` crashed generation after all AI work completed, preventing the campaign doc from being written. Newsletter generation has been silently failing since June 6.
- **HTTPS proxy silent failure.** `serve.js` `_startHttpsProxy` now returns a boolean. The caller uses `httpsReady` (not `httpsEnabled`) for port and env decisions, so when cert generation fails, the server correctly falls back to plain HTTP instead of setting `BEM_HTTPS_PORT` with no proxy listening.
- **AI system prompt injection for array content blocks.** `normalizeOptions` now handles system messages with array content (content blocks) — prepends rules as a `{ type: 'text' }` block. Previously, the if/else-if chain fell through and rules were silently dropped.
- **Setup retry loop treats warns as failures.** Added `warnCount` tracking; the `allPassed` check now includes warns (`testCount + warnCount === testTotal`). Warns no longer trigger unnecessary retries with `--retry N`.
- **Copy-paste: `sender: 'electron-manager'` in setup IPC.** Changed to `'backend-manager'`.
- **Test account creation race condition.** `deleteTestUsers` now uses the emulator's bulk-clear REST API instead of individual `deleteUser()` calls. Individual deletes triggered async on-delete handlers that could clobber freshly-created accounts (80-100% repro rate). Bulk clear eliminates the race entirely.
- **Consent rules test value collision.** Changed test value from `'granted'` to `'forged'` so the write always differs from prior test state.
- **`cancel-too-young` timestampUNIX convention.** `Date.now()` (milliseconds) → `Math.floor(Date.now() / 1000)` (seconds).

### Added
- **AI array-content test.** `normalize-options-structured-system-content-as-array-injects-rules` — covers the missing branch.
- **Auth on-delete race condition test.** `test/events/auth-delete-race.js` — proves the emulator race (clobber without mitigation) and verifies both mitigation strategies (wait-for-gone, force-delete).
- **Root package.json setup check.** Validates the project root `package.json` during `npx mgr setup`.

# [5.7.1] - 2026-06-17

### Added
- **MCP shorthand URL.** MCP endpoint now accessible at `/mcp` in addition to `/backend-manager/mcp`. Hosting rewrites updated; consumer projects pick up on next `npx mgr setup`.
- **`/register` hosting rewrite.** Dynamic client registration endpoint now included in the default hosting rewrite pattern.

# [5.7.0] - 2026-06-17

### Added
- **MCP role-based tool scoping.** 25 tools (was 19) with admin/user/public roles. Admin sees all, user sees `get_user` + `get_subscription` + `health_check`, unauthenticated gets 401 triggering OAuth. Defense-in-depth: route-level auth still validates.
- **MCP OAuth user authentication.** OAuth 2.1 with PKCE + dynamic client registration (RFC 7591). User sign-in via consumer website's `/token` page → Firebase ID token → exchanged for `api.privateKey`. Verified end-to-end in Claude Desktop.
- **MCP consumer tools.** Consumer projects define custom MCP tools in `functions/mcp.js` — route delegation (works on stdio + HTTP) or handler mode (HTTP only). Consumer tools override same-name built-ins.
- **MCP tool annotations.** `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` on all tools. Claude Desktop shows read/write categorization and human-readable titles.
- **6 new MCP tools:** `update_post`, `update_campaign`, `delete_campaign`, `create_contact`, `delete_contact`, `get_payment_portal`.
- **HTTPS local dev.** `npx mgr serve` starts an HTTPS proxy on port 5002 (firebase serve on 5443 internally) with auto-generated mkcert certificates. Claude Desktop requires HTTPS for MCP connectors. Disable with `--no-https`.
- **MCP CLI `--token` flag.** `npx mgr mcp --token <api-key>` for user-level stdio connections.

### Changed
- **MCP discovery endpoints** use root-level issuer per RFC 8414 (was path-scoped, broke Claude Desktop's discovery chain).
- **`getApiUrl()`** returns `https://localhost:<port>` when `BEM_HTTPS_PORT` is set (serve command sets this automatically).
- **`cancel_subscription`, `refund_payment`, `generate_uuid`** moved from user/public to admin role (destructive operations and dev utilities shouldn't be in user-facing MCP).
- **`resolveConsumerAuthUrl()`** uses `Manager.getWebsiteUrl()` (auto-resolves localhost in dev) instead of `brand.url` (always production).

# [5.6.6] - 2026-06-15

### Added
- **`'warn'` return type for setup checks.** `run()` can now return the string `'warn'` for non-blocking failures — the check prints as `⚠` with detail lines from `getWarning()`, is counted in the summary (`36 passed, 1 warned, 0 failed`), but does **not** halt setup. `BaseTest` provides a default `getWarning()` returning `[]`. `Summary` gains a `warn(name, details)` method alongside `pass()` and `fail()`.
- **Java setup check** (`setup-tests/java-installed.js`). Checks whether Java is installed (required by the Firebase Firestore emulator for testing). Uses the `'warn'` return type — setup continues without Java, but the summary reports it.
- **Java pre-check in test runner.** `npx mgr test` now checks for Java before starting the emulator and fails fast with a clear message (`Java is required to run tests`) instead of the raw emulator crash.

### Changed
- **Firebase CLI and auth setup checks no longer halt setup.** Both checks now use the `'warn'` return type instead of throwing from `fix()`. Missing Firebase CLI or unauthenticated state is reported in the summary but does not block the remaining checks.

# [5.6.5] - 2026-06-14

### Added
- **Cross-provider native tool calling in the AI library (agentic loops).** `ai.request()` now supports a unified tools interface on every text provider: `tools.list` accepts normalized function tools (`{ name, description, parameters }` — JSON Schema), `tools.choice` accepts `'auto' | 'required' | 'none' | { name }`, and the response adds `toolCalls: [{ id, name, arguments }]` (arguments parsed) plus `stopReason: 'tool_use' | 'end' | 'max_tokens'`. The Anthropic and claude-code providers gain native `tool_use` via a shared pure formatter (`providers/anthropic-format.js` — tool defs → `input_schema`, choice mapping incl. `required`→`any`, response extraction); the OpenAI provider normalizes function tools to the Responses API envelope (hosted tools like `{ type: 'web_search' }` still pass verbatim, and throw a clear error on Anthropic) and extracts `function_call` items. Multi-turn loop continuation is first-class through `options.messages`: `{ role: 'assistant', toolCalls }` and `{ role: 'tool', toolCallId, content }` turns map to each provider's wire format (consecutive tool results merge into one Anthropic user turn; OpenAI gets `function_call`/`function_call_output` items), raw Anthropic block arrays replay verbatim, and `normalizeOptions()` no longer string-flattens structured conversations (system-prompt injections still apply). OpenAI additionally gains a direct-messages mode: passing `messages[]` now sends ALL turns (previously middle turns were silently dropped in favor of prompt/message/history). JSON parsing (`response: 'json'`) is skipped on tool-call turns, where empty text is the normal intermediate state. Return shapes stay backward-compatible (`{ content, output, tokens, raw }` unchanged; OpenAI now also returns `raw`). Covered by `test/helpers/ai-tools-format.js` (pure, 22 cases) and `test/ai/tools-live.js` (extended-mode real 2-step tool loops on both providers; OpenAI live-validated).
- **Deterministic `test` AI provider** (`providers/test.js`, registered as `provider: 'test'`) — the AI analog of the `test` payment processor: a first-class provider that consumer suites drive with directives embedded in the last user message (`[[tool:name {json}]]`, `[[tools:[...]]]` for parallel calls, `[[reply:{json}]]`, `[[delay:ms]]`, `[[error:msg]]`), consumed sequentially across the turns of a tool loop. Refuses to run outside development/testing (Manager environment detection; falls back to `BEM_TESTING`/`FUNCTIONS_EMULATOR` signals when constructed without a Manager). Lets consumer chat/agent routes test the full loop — Firestore writes, usage, locks, tool executors — against the real emulator with zero paid API calls. Covered by `test/helpers/ai-test-provider.js`.
- **OpenAI provider constructor hardened** — `assistant.Manager` access now uses optional chaining (matching the Anthropic provider), so the provider can be constructed with a minimal assistant context (direct construction in tests/tools).
- **`docs/cdp-debugging.md` — launching a controllable browser (mirrored across UJM/BEM/BXM/EM).** The canonical Chrome launch for agents and humans: CDP port + REQUIRED dedicated `--user-data-dir` (Chrome 136+ silently ignores the debug port on the default profile — verified on 149), the persistent agent profile (`~/Library/Application Support/chrome-profiles/agent` — log in once, state survives relaunches, verified), the shared-instance model (CDP is multi-client — agents share the one logged-in Chrome on one port, one tab each; a second profile/port only for a second identity), safe quit by profile match, and driving via the `chrome-devtools` MCP (`CHROME_CDP_PORT` set before the session) or any CDP client. BEM flavor: aimed at verifying the frontend against your routes — watch network payloads and drive auth'd flows through the real UI. Indexed in CLAUDE.md.

# [5.6.4] - 2026-06-11

### Changed
- **Consent side effects moved off shared test accounts (journey-account isolation).** The marketing webhook suite's revoke-event tests (`test/routes/marketing/webhook.js`) repeatedly write `consent.marketing.status = 'revoked'` to their target account — persistent side-effect data that previously landed on the shared `basic` account, leaving it revoked for the remainder of every run (and, since the v5.6.3 library consent gate, changing `sync()`/`add()` behavior for every later suite touching it). They now target a dedicated `journey-webhook-revoke` account. The extended-mode lifecycle suite (`test/email/marketing-lifecycle.js`) likewise now syncs a dedicated `journey-marketing-sync` account (`_test.allow_*` prefix) instead of the shared `consent-granted` sentinel (which the signup + consent-lifecycle suites rely on). Its cleanup step also now deletes the contact the suite actually created — previously it deleted the ADMIN account's contact, which (post-v5.6.3) revoked admin's doc consent mid-run AND left the synced contact behind in SendGrid/Beehiiv after every extended run. `docs/test-framework.md`'s journey-account rule now lists `consent.marketing` writes as a trigger. Validated: marketing route suites pass (46 passing / 10 env-gated skips / 0 failures).

### Fixed
- **Anonymous HMAC unsubscribe tests now actually run.** The self-test boot (`src/cli/commands/test.js`) injects a test-only `UNSUBSCRIBE_HMAC_KEY` into the process env (the emulated functions inherit it — same mechanism as the fixture webhook key), closing the fixture gap that left all 8 anon-HMAC tests in `test/routes/marketing/email-preferences.js` failing as "known env gap". Those tests are the route-level coverage for the v5.6.3 HMAC changes (signature validation, rate limiting, consent mirroring); marketing suites went from 38 passing + 8 failing to 46 passing + 0 failing.

# [5.6.3] - 2026-06-11

### Fixed
- **NeverBounce single-check result parsing — every signup mailbox check has failed since v5.5.1.** `validation-provider-neverbounce.js` compared `data.result` against numeric codes (`data.result === 0 || 3 || 4`), but the NeverBounce v4 single/check API returns string textcodes (`"valid"`, `"invalid"`, ...) — so every completed check returned `{ valid: false, status: 'unknown' }`, including deliverable mailboxes, and the signup route silently skipped marketing sync for ALL signups. Production-confirmed via GCF logs: somiibo June 7 = 30 synced / 0 failed; June 9–11 = 0 synced / 93 failed; first failure 25 minutes after the v5.5.1 deploy (which switched signup to `ALL_CHECKS` and exposed the latent v5.5.0 bug). New `parseResult()` handles textcodes (canonical), tolerates numeric codes, and normalizes `catch-all` → `catchall`; allowed results stay valid/catchall/unknown. 11 regression parse cases added to `validation.test.js` (suite now 69 cases); fix live-validated against the real API. ZeroBounce provider audited — already string-based, no change.
- **Library-level marketing consent gate.** `Marketing.sync()`/`Marketing.add()` (`src/manager/libraries/email/marketing/index.js`) now skip users whose `consent.marketing.status` is the literal string `'revoked'` and return `{ blocked: 'consent', email }` (mirroring the `{ blocked: 'validation', ... }` shape) — BEFORE validation and provider calls. Previously the gate existed only at SOME call sites, so the payments on-write sync (`events/firestore/payments-webhooks/on-write.js`) and the admin PUT re-sync re-added users who had unsubscribed. `sync()` gates after the user doc is resolved (doc or uid); `add()` looks up the user by email first (same `auth.email` query as the webhook processors) — no user doc or lookup failure proceeds (fail open). ONLY `'revoked'` blocks: missing/null consent proceeds, so legacy users without a `consent` field keep syncing. `remove()` stays ungated. Covers all callers including the legacy API-command twins (`add-marketing-contact.js`). Gate logic unit-tested in `src/manager/libraries/email/marketing/consent-gate.test.js` (28 plain-node cases, no emulator).
- **Anonymous HMAC unsubscribe now removes the contact from Beehiiv too** (`routes/marketing/email-preferences/post.js`). The email-footer one-click unsubscribe only suppressed the SendGrid ASM group, leaving the contact live on Beehiiv — a compliance bug. The route now also calls `mailer.remove(email)` (best-effort, after the ASM call succeeds).
- **Anonymous HMAC re-subscribe now actually re-adds the contact.** Previously it only lifted the ASM suppression and wrote consent `granted` — the contact was never re-added to providers. `mirrorAnonymousToUserDoc` now returns the matched uid (or null); the route calls `mailer.sync(uid)` for matched users (the mirror writes `granted` first, so the library consent gate passes — no bypass flags) or `mailer.add({ email, source: 'resubscribe' })` for pure newsletter contacts. Best-effort, same testing guard as the ASM call.
- **Admin `DELETE /marketing/contact` now sticks** (`routes/marketing/contact/delete.js`). The route removed the contact from providers but left `consent.marketing.status = 'granted'`, so any later sync re-added the contact. After the provider removal it now mirrors `consent.marketing.status = 'revoked'` (`revokedAt` with `source: 'admin'`, same write shape as the webhook processors) to the matching user doc — best-effort, silent when the email maps to no user.
- **Stale docs/comments corrected in the same change set:** `docs/consent.md` now describes the shipped library gate, cross-provider HMAC unsubscribe, re-subscribe re-add, and admin-DELETE revoke mirror (new capture point 5); `validation.js` header no longer claims signup uses "disposable check only" (it runs `ALL_CHECKS` before marketing sync); `marketing/index.js` header no longer attributes the signup sync to the "Auth on-create handler" (it's the `/user/signup` route).

# [5.6.2] - 2026-06-11

### Fixed
- **4 stale framework tests aligned with shipped v5.5.4–v5.5.6 validation behavior.** The default `npx mgr test` run failed 4 tests whose expectations predated intentional source changes: `test/email/validation.js` still expected all-numeric (`123456@`) and short letter+number (`a123@`) local parts to be blocked (both patterns were removed in v5.5.6 after NeverBounce confirmed real users — QQ emails, real Gmail accounts — were being blocked; tests renamed `localpart-all-numeric-allowed` / `localpart-letter-plus-numbers-allowed`) and expected the pre-v5.5.5 `DEFAULT_CHECKS`/`ALL_CHECKS` lists (now include `typo`, and `dns` in `ALL_CHECKS`); `test/routes/marketing/webhook.js`'s bounce test sent no `bounce_classification`, which v5.5.4 deliberately skips (renamed `sendgrid-hard-bounce-event-handled`, now sends `'Invalid Address'`).

### Added
- **Suite coverage for the v5.5.5 `typo` + `dns` email validation checks** (previously only covered by the standalone `validation.test.js` script): typo-domain blocking (`gamil.com`, `gmail.con`) + correct-domain pass-through, dns-not-in-default-checks, an offline-safe dns positive (network errors skip, never block), and an extended-gated (`TEST_EXTENDED_MODE`) dns negative for nonexistent domains.
- **Suite coverage for the v5.5.4 bounce-classification filter**: `dropped` + `'Invalid Address'` revokes, technical bounce (`'Technical Failure'`) skipped, and unclassified bounce skipped — locking in that sender-side bounces never revoke recipient consent.

# [5.6.1] - 2026-06-11

### Added
- **`docs/audit.md` — full-audit check catalog (`/omega:bem audit`).** ID'd, severity-graded checks with scope auto-detect (consumer vs framework via `functions/package.json`): mirrored universal checks (U-01..U-14 — tests at every surface, sanitization, secrets incl. `service-account.json`, config canon, doc parity, dead/legacy patterns, dep health, …), BEM-specific checks (BEM-01..BEM-09 — name-matched context-object schemas, the required-vs-default footgun, ownership checks + `assistant.respond()`, index.js/rewrites wiring, Firestore canon, usage helper + rate limits, composite indexes, auth gates, rules coverage), and framework-repo checks (F-01..F-04). Findings persist to `functions/.temp/audit/claude-audit.md`; fixes run as a severity-ordered TodoWrite loop ending with a green `npx mgr test`. Wired to the `omega:bem` router's Audit process; `docs/audit.md` is mirrored across UJM/BXM/EM. Indexed in CLAUDE.md.

### Changed
- **package.json `keywords` corrected** — replaced the thin generic set (`cli`, `backend manager`, `firebase`) with accurate, discovery-oriented ones (`firebase`, `firebase-functions`, `cloud-functions`, `firestore`, `backend`, `serverless`, `api`, `express`, `cli`). npm-listing metadata only; no behavior change. Mirrored across UJM/BXM/EM.

# [5.6.0] - 2026-06-11

### Added
- **`docs/migration.md` (action-skill consolidation).** The standalone `BEM:migrate` skill was deleted and folded into `omega:bem` as a process checklist; its playbooks landed in the repo as `docs/migration.md` — env-var migration (runtime config → top-level `functions/.env` keys with the full mapping table), legacy code conversion (`Manager.config.*` → `process.env.*`), and route/schema migration to the current context-object/flat formats. Indexed in CLAUDE.md.
- **Dev-process guidance relaxed: only `npx mgr serve` / `npx mgr emulator` are off-limits.** The "NEVER run" rule in CLAUDE.md now prohibits only the long-running dev processes (instruct the user to start them if they aren't running; read `functions/*.log`, never tail) — `npx mgr test` is fine to run (it auto-starts its own emulator).
- **Skills-as-routers migration — `docs/firestore.md` (new) + `routes.md`/`schemas.md` rewrites + `test-framework.md`/`usage-rate-limiting.md` extensions.** Framework facts migrated from the `omega:bem` skill into the repo so they version-match the installed package, with stale content corrected against source: `routes.md`'s consumer-route recipe now shows the CURRENT context-object handler (`module.exports = async ({ Manager, assistant, user, settings, ... })` — middleware calls `routeHandler(context)`; the old `Route.prototype.main` constructor example was stale) plus the CRUD method-file table, ownership checks, plural naming, firebase.json rewrite syntax + first-match ordering, and the `functions/index.js` entry pattern; `schemas.md` rewritten to the current contract (context object `{ assistant, user, data, method, headers, geolocation, client }` → FLAT schema with in-function plan branching — the old positional-args + `defaults:/premium:` tier examples were stale) plus field properties (`value`/`clean`/function `required`), the required-vs-default footgun, and the ID-generation/path-extraction patterns; new `firestore.md` carries the Firestore conventions (`.doc('col/id')` style, NO subcollections, ~500-doc cursor-paginated batch reads, `metadata.{created,updated}` timestamps, mirror-the-doc response format + delete-don't-redact); `test-framework.md` gains the `rules` client reference (`asAccount`/`expectSuccess`/`expectFailure` + seed-as-admin pattern), the journey-account isolation rule (CRITICAL — never use shared accounts with the `test` processor), naming conventions, and common patterns (auth rejection, concurrent-duplicate rejection, suite cleanup); `usage-rate-limiting.md` gains the core API table (`validate`/`increment`/`update`/`getLimit`/`getProduct`/`getUsage`) and the never-write-usage-manually rules. All indexed in CLAUDE.md; the skill is now a thin router (pointers + hard rules + process checklists).
- **`--extended` CLI flag for cross-framework parity.** `npx mgr test --extended` is now the CLI shorthand for the shared, unprefixed `TEST_EXTENDED_MODE` env var (standardized across BEM/BXM/UJM/EM) — equivalent to `TEST_EXTENDED_MODE=true npx mgr test`. The flag is read pre-flight in `src/cli/commands/test.js` (before the `captureSyncedEnv`/`writeTestMode` pre-flight), so it propagates to BOTH the test-runner subprocess (`{ ...process.env }`) AND the live emulator (via `.temp/test-mode.json`) exactly like the env var. The env-var path keeps working — env var OR flag opts into REAL external services (default: skipped).
- **Framework self-test from the repo (bundled fixture + `BEM_TEST_BOOT_PROJECT`).** `npx mgr test` run from the backend-manager repo now boots a bundled fixture Firebase project ([`src/test/fixtures/firebase-project/`](src/test/fixtures/firebase-project)) and runs a `test/boot/` smoke suite (emulator boots → fixture `Manager.init()` wires `bm_api` → health returns 200), instead of failing with "no firebase.json". Brings BEM into parity with BXM's `BXM_TEST_BOOT_PROJECT` / UJM's `UJ_TEST_BOOT_PROJECT`. The runner symlinks the local `backend-manager` (+ `firebase-admin`/`firebase-functions`) into the fixture, injects the fixture admin keys, and generates a throwaway emulator-only service account at runtime (all gitignored). `BEM_TEST_BOOT_PROJECT=<path>` overrides the fixture to self-test against a real consumer. The `boot/` smoke is excluded from consumer runs; the full `routes`/`events`/`rules` suites still run against a real consumer as before.
- **Docs parity — new `docs/build-system.md` + `docs/logging.md`.** `build-system.md` documents BEM's deliberate outlier status (no consumer build pipeline; framework prepare-package; deploy flow); `logging.md` is now the SSOT for the `functions/*.log` file table (extracted from test-framework.md, which keeps a pointer — mirrors EM/BXM/UJM). Both indexed in CLAUDE.md → Documentation.
- **Test coverage convention (docs).** New mirrored "Test coverage" sections in `CLAUDE.md`, `docs/test-framework.md`, `src/defaults/CLAUDE.md`, and `src/defaults/test/README.md` — every feature ships with tests at every surface it exposes (logic via handler suites, wiring via `http.as(...)` round-trips, rules suites when Firestore rules change); a surface is skipped only when the feature genuinely doesn't have one. UI coverage explicitly lives in the consuming frontends. Mirrored across EM/BXM/UJM.
- **Universal `mgr:` test source prefix.** `npx mgr test` now accepts the universal cross-framework `mgr:` prefix (alias for `bem:`) to run framework-only tests, complementing the existing `bem:` and `project:` prefixes. `npx mgr test mgr:` runs all framework tests, `npx mgr test mgr:<path>` runs framework tests matching a path, and multiple space-separated targets compose (e.g. `npx mgr test bem:rules project:routes`).

### Changed
- **Router skill renamed `BEM:patterns` → `omega:bem`** — all framework skills now live under the `omega:` namespace (`omega:em`/`omega:bxm`/`omega:ujm`/`omega:bem` + the `omega:main` hub). CLAUDE.md's Recommended skills section updated.
- **`docs/testing.md` renamed `docs/test-framework.md`** (H1 `# Testing` → `# Test Framework`) for cross-framework doc-file parity — EM/BXM/UJM all name their test reference `docs/test-framework.md`, and the mirrored docs must match down to the file name. All references updated (`CLAUDE.md`, `README.md`, `docs/*.md` cross-links, `src/defaults/CLAUDE.md`, `src/defaults/test/_init.js`, historical CHANGELOG links).
- **Log files renamed for cross-framework parity.** `functions/serve.log` → `functions/dev.log` (the `npx mgr serve` dev-server output) and `functions/logs.log` → `functions/production.log` (the `npx mgr logs` Cloud Logging output). The `dev`/`test` names now match EM/BXM/UJM; `emulator.log` and `test.log` are unchanged. BEM logs still live in `functions/` (not `logs/`) — that directory is a deliberate exception so they sit beside firebase-tools' own `*-debug.log` files. The watcher reset sentinel `serve.log.reset` is correspondingly `dev.log.reset` (internal, in `.temp/`).

### Fixed
- **`npm publish` vs the fixture's runtime symlinks.** New `prepublishOnly` script removes `src/test/fixtures/firebase-project/functions/node_modules` before packing — the self-test's `backend-manager` symlink points back at the repo root, and prepare-package's publish-time cleanup walk (`jetpack.find` with a top-level-only `!node_modules/**` exclusion) followed the cycle until `ENAMETOOLONG`. The symlinks are throwaway runtime artifacts; the next self-test run regenerates them via `linkFixtureDeps()`.
- **Fixture `.firebaserc` re-included over the global `.gitignore` rule** (`!src/test/fixtures/firebase-project/.firebaserc`) — the emulator boots with no `--project` flag and resolves the demo project from `.firebaserc`, so a fresh clone's self-test would have failed without it.

# [5.5.4] - 2026-06-09

### Fixed
- **SendGrid bounce/dropped webhook filtering.** Bounce and dropped events now only revoke marketing consent when `bounce_classification` is `'Invalid Address'`. Technical bounces (DMARC, TLS, DNS failures) are sender-side issues and no longer revoke the recipient's consent.

### Changed
- **`isSupported()` receives full parsed event.** All webhook processors (`sendgrid`, `beehiiv`) now receive the full parsed event object instead of just the event type string, enabling classification-aware filtering.
- **Config template `parent` field.** Added `parent` field to `backend-manager-config.json` template for newsletter-sources provider configuration.

# [5.5.3] - 2026-06-08

### Fixed
- **Per-provider error isolation in Marketing.sync/add/remove.** Added `.catch()` to each provider promise so one provider failing (e.g. SendGrid timeout during `buildFields`) no longer kills the other. Each provider now resolves independently with `{ success: false, error }` on failure, and the function always returns a per-provider status object instead of throwing.

# [5.5.2] - 2026-06-08

### Fixed
- **Await signup async operations.** `syncMarketingContact()`, `mailer.sync()`, and `sendWelcomeEmails()` were fire-and-forget — the Cloud Function returned the HTTP response while NeverBounce validation and provider syncs were still in flight, causing premature shutdown and request timeouts. All are now properly awaited.

### Changed
- **Welcome emails send in parallel.** `sendWelcomeEmails()` now uses `Promise.all()` for concurrent sends while still awaiting completion.
- **Log inferred contact name.** Signup route now logs the `inferUserContact` result for observability.

# [5.5.1] - 2026-06-07

### Changed
- **Test HTTP client sends plain requests.** `http.post('route')` now goes to `/${route}` instead of `/backend-manager/${route}`. All BEM test files updated to explicitly include `backend-manager/` prefix. Consumer projects can now test their own routes directly (e.g. `http.post('projects', {...})`).
- **`_processMiddleware` checks consumer routes.** Falls back to BEM's own routes directory only if the consumer doesn't have a matching route — enables consumer routes to work through `bm_api`.
- **Signup uses full email validation.** `syncMarketingContact` now runs `ALL_CHECKS` (including NeverBounce mailbox verification) before syncing to marketing lists.

# [5.5.0] - 2026-06-06

### BREAKING
- **Marketing config keys renamed from platform-specific to role-based.** `marketing.sendgrid` → `marketing.campaigns` (with `platform: 'sendgrid'`), `marketing.beehiiv` → `marketing.newsletter` (with `platform: 'beehiiv'`). Response object keys (`providers.sendgrid`/`providers.beehiiv`) renamed to `providers.campaigns`/`providers.newsletter`. Seed campaign provider arrays updated to match. All consumer `backend-manager-config.json` files must be updated.

### Added
- **NeverBounce mailbox verification.** Added as the preferred mailbox verification provider (`NEVERBOUNCE_API_KEY`), with ZeroBounce kept as fallback. Provider logic extracted into pluggable `validation-provider-neverbounce.js` and `validation-provider-zerobounce.js` modules.
- **`platform` property** on marketing config roles — specifies which provider backs each role (e.g. `platform: 'sendgrid'` under `campaigns`).

### Changed
- **Mailbox verification is now provider-agnostic.** `validation.js` dispatches to whichever provider has an API key set, instead of hardcoding ZeroBounce.

# [5.4.1] - 2026-06-06

### Added
- **Push notification campaigns.** Marketing campaign POST route and cron now handle `type: 'push'` with brand-aware icon/clickAction defaults and test-mode owner filtering.
- **`filters` field** in campaign schema for push notification targeting.
- **Test filtering docs** in CLAUDE.md and docs/test-framework.md (`npx mgr test <path>`, `bem:`, `project:` prefixes).

### Fixed
- **Email migration shims (temporary).** Old template names (`default` → `card`, `core/engagement/feedback` → `feedback`) and old data format (`data.body` → `data.content`) mapped for queued emails saved before the MJML migration.
- **Double-escaped URLs in email templates.** Button hrefs, signoff links, and CTA URLs were HTML-escaped via `escape()`, breaking URLs with `&` characters. Removed `escape()` from href attributes across all templates while keeping it on display text.
- **Spacer elements.** Replaced `&nbsp;` text hacks with proper `mj-spacer` elements in base template.
- **Notification library defaults.** Icon and click URL now use brand config instead of hardcoded ITW values.

# [5.4.0] - 2026-06-05

### Added
- **Unified MJML email system.** All emails (transactional, marketing, newsletter) rendered server-side via composable MJML templates. No more SendGrid dynamic templates (`d-xxx` IDs).
- **Composable template blocks** in `base.js`: `skeleton()`, `logo()`, `cardWrapper()`, `signoff()`, `button()`, `footer()` — templates compose what they need.
- **4 email templates:** `card` (default), `plain` (full-width personal), `order` (9 payment event types), `feedback` (rating faces with gift card incentive).
- **Shared preparation layer** (`prepare.js`): brand resolution, sender resolution, markdown rendering, signoff defaults, categories, HMAC unsubscribe URLs, template data building.
- **Marketing campaign CTA buttons** and discount codes in seed campaigns. Each audience segment gets tailored copy + audience-matched discount code.
- **`id="email-content"` wrapper** on all compiled email HTML (matches legacy SendGrid template convention).
- **`docs/email-system.md`** deep reference for the entire email pipeline.
- **New test accounts:** `intent-discount-validation`, names on all journey accounts for email personalization.
- **New test:** `journey-payments-discount` for subscription with promo code.
- **Email tests reorganized** under `test/email/` mirroring `src/manager/libraries/email/`.

### Changed
- **`data.body` → `data.content`** across all email callers and templates. Template-specific payload lives in `data.content`; system metadata in `data.brand`/`data.email`/`data.personalization`.
- **`data.order` → `data.content`** for the order template. All payment transition handlers updated.
- **Marketing campaigns consolidated:** top-level `content`/`discountCode` → `data.content.message`/`data.content.discountCode`. Frontend calendar updated.
- **UTM auto-tagging tags ALL HTTP links**, not just brand-domain. Campaign name derived from caller's first category. Signup signoff URLs no longer hardcode UTM.
- **Marketing unsubscribe** uses `<%asm_group_unsubscribe_raw_url%>` for per-recipient links in Single Sends.
- **Schema defaults** `'default'` → `'card'` in admin/email, marketing/campaign, MCP tools.
- **Seed campaign enforced templates** `'core/card'` → `'card'`.
- **Seed campaign discount codes** matched to audience-restricted codes from `discount-codes.js`.

### Fixed
- **UTM tags missing on template-generated links.** `renderEmail()` now calls `tagLinks()` on compiled HTML (CTA buttons, footer, signoff links).
- **Newsletter fallback alert email blank.** Used old `data.body` key — updated to `data.content`.
- **`IMAGE_MAX_DIMENSION` test expected 4096** but source was changed to 2048.
- **Intent discount test used hardcoded `frequency: 'monthly'`** — product only has `daily`. Now reads from product config.
- **Marketing lifecycle sync test** used `_test.admin` email blocked by validation. Now syncs the lifecycle test contact.
- **AI inference test assertions** too strict — softened to tolerate AI flakiness.
- **Test account isolation:** `intent-discount-validation` gets its own account to avoid pollution from journey tests.

### Removed
- **SendGrid template ID references** from schemas and seed campaign enforced fields.
- **`core/` template aliases** — callers use direct names (`card`, `order`, `feedback`, `plain`).
- **Top-level `content` and `discountCode`** fields from marketing campaign schema.

# [5.3.5] - 2026-06-04

### Added
- **Campaign integration test.** `test/routes/marketing/campaign.js` covers send-to-test_admin (extended mode), future-campaign-pending, and auth gate checks.
- **Provider observability logs.** SendGrid: `resolveFieldIds`, `addContact` (email + list + field count), `buildFields` (warns on unmapped fields). Beehiiv: `addSubscriber` (email + publication + field count). These were completely silent before.

### Fixed
- **Beehiiv fallback alert used `brand.url` for email domain.** Subdomain projects (e.g. Ultimate Jekyll) built `alerts@ultimate-jekyll.itwcreativeworks.com` instead of the correct `alerts@itwcreativeworks.com`. Now derives domain from `brand.contact.email`.

# [5.3.4] - 2026-06-04

### Added
- **`monthly-weekday` recurrence pattern.** Campaigns can now recur on the Nth weekday of each month (e.g., 2nd Wednesday). New `getNextOccurrence` case + `nextNthWeekday()` helper.
- **Minute precision for campaign scheduling.** All scheduling helpers (`nextWeekday`, `nextNthWeekday`, `nextMonthDay`, `getNextOccurrence`) now accept an optional `minute` parameter (previously hour-only).
- **Emulator project mismatch detection.** Health check returns `projectId`; the test runner compares it (via Emulator Hub + health endpoint) and aborts immediately if the running emulator belongs to a different project.
- **CDN image pre-scaling.** `admin/post` adds `?w=&q=` params to Unsplash URLs before downloading so the CDN delivers a pre-scaled image (~314KB vs 3.8MB) and sharp never decodes a massive original.
- **Emulator orphan cleanup.** `npx mgr emulator` sweeps all emulator ports after shutdown and kills orphaned Java processes (Firestore, Database, PubSub) that survived SIGTERM.
- **SendGrid sender identity resolution.** `resolveSenderIds()` fetches verified senders and maps `from_email → sender_id` for Single Send campaigns.

### Changed
- **Campaign scheduling helpers consolidated into `constants.js` (SSOT).** `getNextOccurrence`, `nextWeekday`, `nextNthWeekday`, and `nextMonthDay` were duplicated across `seed-campaigns.js` and both cron jobs — now imported from a single source.
- **Default campaign send times changed to Wednesday 10:30 AM PT (17:30 UTC).** Sale campaigns use the 2nd Wednesday of each month (`monthly-weekday`); newsletter sends every Wednesday (`weekly`). Previously: 15th of month at 14:00 UTC / Monday at 10:00 UTC.
- **`IMAGE_MAX_DIMENSION` reduced from 4096 to 2048.** Blog header images capped at 2048px on the long edge. Reduces peak memory in `admin/post` from ~71MB to ~11MB decoded. Matches UJM's `imagemin.js`.
- **`sharp.cache(false)` in `resizeImage()`.** Disables sharp's pixel cache so decoded buffers are freed immediately between images, preventing OOM on 256MB Cloud Functions.
- **Emulator SIGINT handling.** Ctrl+C handler is now synchronous (prevents Node from exiting before shutdown completes). Second Ctrl+C force-kills. Port sweep runs after exit regardless of spam.
- **SendGrid `createSingleSend` fixes.** Resolves `sender_id` from Sender Identities, builds `html_content` from preheader + dynamic content, uses `resolvedSettings` for segment mapping.

### Fixed
- **Marketing segment resolution used wrong settings object.** `sendCampaign` passed `settings.segments` instead of `resolvedSettings.segments`, ignoring campaign-level overrides.

# [5.3.3] - 2026-06-03

### BREAKING
- **Payment webhook routes no longer accept `BACKEND_MANAGER_KEY` as a fallback.** `/payments/webhook` and `/payments/dispute-alert` now only accept `BACKEND_MANAGER_WEBHOOK_KEY`. All consumer brands must have `BACKEND_MANAGER_WEBHOOK_KEY` set in their `.env` and registered with their payment providers (Stripe, PayPal, Chargebee, Chargeblast) before upgrading to this version.

# [5.3.2] - 2026-06-03

### Added
- **Newsletter HTML preview via GitHub Pages.** Enabled GitHub Pages on the `newsletter-assets` repo so newsletter HTML renders natively in the browser. Added `PAGES_BASE` constant and `previewUrl` to `image-host.js` uploads, threaded through to the Firestore campaign `assets` doc and the Beehiiv fallback alert email.

### Changed
- **Cleaner Beehiiv fallback email.** Restructured the asset links to use clean anchor text with a nested list (preview / raw HTML) under "Full HTML" instead of displaying raw GitHub URLs.
- **Download-app-link email subject.** Friendlier subject line format.

# [5.3.1] - 2026-06-02

### Fixed
- **Leaking `wonderful-fetch` mock in the webhook-forward unit test.** `test/helpers/webhook-forward.js` installs a stub into `require.cache['wonderful-fetch']` at module load (the sanctioned cross-project fan-out exception — there's no second BEM emulator to receive the real fan-out POSTs), but never restored it. Because every test file is `require()`d into the same process, the stub leaked process-wide: every later test whose route did `require('wonderful-fetch')` got `{ received: true }` in 0ms instead of a real HTTP round-trip (observed breaking consumer sponsorship + inbound-email route tests). The helper now saves the original cache entry and restores it in a suite-level `cleanup()`, confining the mock to its own file.

# [5.3.0] - 2026-06-02

### Added
- **`Manager.AI(assistant).image({ prompt, ... })`** — image generation via OpenAI's `gpt-image-2`. Separate method from `request()` (return type is bytes, not text; bypasses moderation/token-accounting/schema/prompt-normalization, none of which apply to image gen). Returns `{ buffer, b64, mime, revisedPrompt, model, size, quality, raw }` for a single image, or an array when `n > 1`. Options: `prompt` (required), `model` (default `gpt-image-2`), `size` (`1024x1024` default), `quality` (`medium` default), `background`, `n`, `timeout` (default 5min — image gen is slow). Only `openai` implements it. Lives on `OpenAI.prototype.image()` + dispatched via `AI.prototype.image()`. See [docs/ai-library.md](docs/ai-library.md).
- **AI tools passthrough (nested) — `ai.request({ tools: { list, choice } })`.** `tools.list` is an array of tool definitions passed to the OpenAI Responses API verbatim — built-in hosted tools (e.g. `{ type: 'web_search' }`) OR custom function tools (`{ type: 'function', name, parameters }`); `tools.choice` *(optional)* maps to `tool_choice`. Opt-in — omitted/empty means no tools and identical behavior to a plain request. Primary use is OpenAI's built-in **web search** so the model finds and cites real, currently-live URLs instead of hallucinating them. When tools are active the response `output` may carry tool-call items (e.g. `web_search_call`) + `url_citation` annotations; the message-text extractor ignores non-message items so `r.content` is unaffected. See [docs/ai-library.md](docs/ai-library.md).
- **`image-illustrator.js` — newsletter section illustrations now generated as flat-vector PNGs via `gpt-image-2` by default**, replacing the SVG-author-then-rasterize approach as the default. Clean flat 2D vector style (Stripe / Linear / undraw.co aesthetic) built from the brand palette (`content.theme.{primary,secondary,accent}Color`), white background, no text. The legacy `svg-illustrator.js` method is still available per-brand via `marketing.beehiiv.content.method.image = 'svg'`. Both return the same `{ png: Buffer, fallback, meta }` contract, so `image-host.js` / `uploadAssets` are unchanged. Validated end-to-end against live `gpt-image-2` with Somiibo's real config. See [docs/marketing-campaigns.md](docs/marketing-campaigns.md).
- **Full emulator-Firestore flush before every test run.** `deleteTestUsers()` now calls `flushEmulatorFirestore()` — `listCollections()` + `recursiveDelete()` on the entire emulator DB — before recreating test accounts. The emulator DB is 100% test data, so a full flush is the simplest correct clean slate; there are no per-collection allowlists to maintain. Guarded to run ONLY when `FIRESTORE_EMULATOR_HOST` is set, so it can never touch a real project.
- **`test/_init.js` pre-test lifecycle hook.** The test runner loads an optional `test/_init.js` from BOTH test roots (BEM core + consumer project) and runs it before any test (it is not run as a test itself). The module **must export a function** — `module.exports = (ctx) => ({ ... })` — called with `{ config, Manager }` and returning the hook object. It may declare `accounts` (array of extra test accounts `{ id, uid, email, properties }`, created/fetched/deleted on the same path as the built-ins so a project has a user per lifecycle) and `async setup({ admin, config, accounts, Manager, assistant })` (reseed fixtures into the freshly-flushed DB, after account creation). There is **no `cleanup` hook** — the whole DB is flushed each run and each test cleans up after itself. A default boilerplate `test/_init.js` now ships via `src/defaults/` (copied into consumers on first `npx mgr setup`, never overwriting an existing one). Mirrored across all four OMEGA frameworks. See `docs/test-framework.md`.

### Changed
- **Environment detection consolidated onto the Manager as SSOT.** `getEnvironment()` returns exactly one of `development | testing | production` (mutually exclusive, testing wins), read **live** from `process.env` on every call (no caching). `assistant.isDevelopment/isProduction/isTesting/getEnvironment` forward to the Manager. Fixes a bug where a cached environment made `getApiUrl()` resolve to the production URL inside the test runner.
- **Install-command parity.** `npx mgr install` accepts the unified alias set across all four frameworks — `dev|d|development|local|l` for the local source install and `live|prod|p|production` for the published version; docs advertise the canonical `dev` + `live`.
- **`copyDefaults` no longer skips `_`-prefixed filenames.** The archive-skip rule now only applies to `_`-prefixed *directory* segments (e.g. `_legacy/`); a `_`-prefixed *filename* like `test/_init.js` ships verbatim. The `_.env` / `_.gitignore` dotfile rename is unchanged.

### Fixed
- **Test-account creation race.** A late `auth:on-delete` could clobber the fresh `auth:on-create` doc, leaving accounts without `api.clientId`/`privateKey` and cascading into dozens of auth/payment test failures. `createAccount()` now verifies the API keys landed and repairs (recreate) if a stale delete clobbered the doc, making the suite deterministic.
- **`meta/stats` seed ordering.** `ensureMetaStats()` ran before the emulator flush (so it was wiped) and skipped when the doc already existed (so the notification on-write trigger could leave it without a `users` field). It now merges the `users` baseline AFTER the flush, fixing flaky admin-stats tests.
- **Flaky payment/dispute tests.** The trial journey now skips cleanly when no paid product has `trial.days > 0` (mirrors trial-cancel) instead of timing out; the dispute-alert dedup test seeds a deterministic in-flight doc instead of racing a live webhook to `failed`.

# [5.2.19] - 2026-05-29

### Added

- **Shared CLI styling module (`src/cli/utils/ui.js`)** — the SSOT for BEM console output, matching the OMEGA Manager look: a `🚀` banner, 70-char `━` dividers, indented tree output, dimmed `Label:` fields, timestamps, a consistent set of status symbols (`→ ✓ ✗ ⊘ ⚠ ✅ + ↻`), and a `Summary` block (green `✅` / yellow `⚠`). Exposed on every command as `this.ui` (wired in `base-command.js`) and adoptable incrementally by `serve`/`deploy`/`test`/`emulator`. See `docs/cli-output.md`.
- **Regression test for the `.env`/`.gitignore` merge** (`test/helpers/merge-line-files.js`). Covers key-based alignment when key order drifts (the original scramble), Custom→Default promotion when the template adopts a key, Default→Custom migration of unknown keys, value preservation, quote normalization, idempotency, and that the setup-test helper is the same function as the canonical impl (SSOT guard).

### Changed

- **`npx mgr setup` now renders in the OMEGA style.** The old `---- RUNNING SETUP ----` / `[1] name: passed` / bare missing-keys dump is replaced with a banner, a divider-wrapped project header (brand name + Firebase console URL + `Project`/`API` fields), and `[DEFAULTS]` / `[CHECKS]` / `[STATS]` sections. Each check prints `[N] ✓ name`, with `⚠ … — fixing…` → `✓ fixed` on auto-fix and `✗ Could not fix: …` on hard failure. The run ends with a `Summary` block (checks count, duration, passed/failed, and any failing checks with detail lines). The `bem-config` check lists the missing `backend-manager-config.json` keys as a bulleted list and surfaces a compact version in the summary.

### Fixed

- **No more `UnhandledPromiseRejection` crash on setup failure.** Previously an unfixable check (e.g. missing config keys) rejected a promise with no reason, which bubbled out of the un-`catch`'d `bin/backend-manager` IIFE as Node's raw `UnhandledPromiseRejection: undefined` dump (exit non-zero, lost message). Setup now exits cleanly via `haltSetup()` → `process.exit(1)` after printing the styled summary, and `bin/backend-manager` wraps the run in a `try/catch` that prints a one-line `✗ <message>` backstop. The early-exit guards (missing `functions/package.json`, wrong directory) now print styled errors and exit `1` instead of `0`.
- **`.env` merge no longer scrambles keys under the wrong headers.** The `has correct .env file` / `has correct .gitignore` setup checks (`env-file.js`, `gitignore.js`) imported a SECOND, **positional** merge implementation in `src/cli/commands/setup-tests/helpers/merge-line-files.js` that zipped comment lines and value lines by index — so any drift between the consumer's key order and the template shifted every value down a slot (the last key of each group landed under the next group's header), dropped newly-added template keys, and duplicated keys. That duplicate is **deleted**; the helper is now a thin SSOT shim re-exporting the canonical key-based merge in `src/utils/merge-line-files.js`. The canonical merge also now **promotes** a key from the user's Custom section up into Default (with its value) when the framework template adopts that key, instead of emitting an empty Default line and leaving the value stranded in Custom.

# [5.2.17] - 2026-05-29

### Added

- **Newsletter-driven blog articles (`marketing.beehiiv.content.article`).** When enabled, the newsletter generator expands its **lead section** (`structure.sections[0]`) into a full blog article via the Ghostii engine, publishes it to the website repo through the `admin/post` route, and injects a "Read the full article" CTA (`section.cta = { label, url }`) onto that section so the newsletter links to the long-form post. The article build runs **concurrently** with SVG image generation (both are slow AI calls) and is **failure-isolated** — if it throws, no CTA is injected and the newsletter ships normally. The published URL (`{brand.url}/blog/{slug}`) is surfaced on the generator return as `assets.articleUrl` and `meta.article`. New config block: `content.article = { enabled, author }` (`enabled` default `false`). See `docs/marketing-campaigns.md`.
- **`section.cta` rendering.** Both the MJML template (`sectionCard`, already supported) and the markdown renderer (`lib/markdown-renderer.js`, new) now render `section.cta = { label, url }` when present. `getBodySections` passes `cta` through for both classic and field-report shapes. CTAs are still never authored by the AI — they're injected by code post-publish with a real, verified URL.
- **Generate/publish split on the linked article (`opts.publishArticle`).** When `config.article.enabled` is on, the article is always **generated** (Ghostii writes it + the public URL is computed from the title slug + the CTA is injected), but it's only **committed** to the website repo via `admin/post` when `opts.publishArticle` is true. The production cron passes `publishArticle: true`. The newsletter iteration test (`test/marketing/newsletter-generate.js`) leaves it false by default — so a full `TEST_EXTENDED_MODE=1` run exercises the Ghostii write + CTA path without committing a real post — and opts in with `NEWSLETTER_CREATE_ARTICLE=1`. The CTA URL is valid either way (derived from the same slugify `admin/post` uses). `meta.article.published` records whether the post was actually committed.

### Changed

- **Extracted the Ghostii article engine into `src/manager/libraries/content/ghostii.js`** (`writeArticle` + `publishArticle`) as the SSOT for the Ghostii API request shape and the `admin/post` publish payload. Both the standalone `ghostii-auto-publisher.js` daily cron and the new newsletter linked-article flow import it (DRY). No behavior change to the standalone cron.
- **Standalone Ghostii is now disabled by default** (`ghostii[0].articles: 0` in `templates/backend-manager-config.json`). The daily `ghostii-auto-publisher.js` cron remains fully functional — set `articles >= 1` to opt back into independent article publishing. For newsletter-linked articles, use `content.article.enabled` instead.

# [5.2.16] - 2026-05-28

### Removed

- **Dropped the legacy top-level `affiliateCode` field from `/user/signup`.** UJM and all current consumers send the referral code as `attribution.affiliate.code`; the top-level `affiliateCode` (and the normalize-to-`attribution` shim + the `processAffiliate` fallback that read it) was a dead legacy path. Removed from `src/manager/schemas/user/signup/post.js`, the `buildUserRecord` normalize block, and the `processAffiliate` lookup in `src/manager/routes/user/signup/post.js`. The route now reads referral codes exclusively from `attribution.affiliate.code`. (The legacy `bm_api` sign-up action `functions/core/actions/api/user/sign-up.js` is unchanged.)

### Fixed

- **Consent: never downgrade an existing granted consent on `/user/signup`** (`src/manager/routes/user/signup/post.js`). A legacy account — signed up before the `flags.signupProcessed` completion flow existed, so the flag was never set — re-fires `/user/signup` on every page load until the flag flips. Its consent payload arrives empty (the original is long gone from `localStorage`), which previously computed `'revoked'` and, on the `{ merge: true }` write, wiped the consent the user actually granted months ago. `buildConsentRecord` now reads the existing doc's consent and preserves any already-`granted` status when the incoming payload doesn't explicitly re-grant it. A genuine new grant still applies; an at-signup decline with no prior grant still records the decline. Added `consent-empty-payload-preserves-existing-grant` and `consent-explicit-decline-does-not-downgrade-existing-grant` tests (+ a dedicated `consent-preserve` test account). See `docs/consent.md`.

### Changed

- **`user/signup` schema: shaped the `consent` field.** `src/manager/schemas/user/signup/post.js` now declares the nested `consent.{legal,marketing}.{granted,text}` shape instead of a bare passthrough object, documenting the input contract at the schema layer (the SSOT for request shape). Each sub-object is optional — omitting it leaves existing consent untouched (see the downgrade guard above).

# [5.2.15] - 2026-05-28

### Changed

- **Standardized the GitHub token env var `GITHUB_TOKEN` → `GH_TOKEN`** across the entire repo, to match the convention used in all other ITW repos. Updated every GitHub-backed route and action (`admin/post`, `content/post`, `admin/repo/content`, `general/fetch-post`, `admin/write-repo-content`, `admin/edit-post`, `admin/create-post`, legacy `create-post`), the email image-host library (`libraries/email/generators/lib/image-host.js`), the CLI deprecated-env notice, the `templates/_.env` scaffold, the `docs/marketing-campaigns.md` reference, and all related test files. This is a hard rename with no fallback — any environment (CI, prod, local `.env`) that still sets `GITHUB_TOKEN` must switch to `GH_TOKEN` for the GitHub-backed routes to work.

# [5.2.14] - 2026-05-28

### Removed

- **Dropped the `marketing-webhooks` Firestore idempotency ledger.** The marketing-webhook dispatcher (`src/manager/routes/marketing/webhook/post.js`) no longer reads/writes `marketing-webhooks/{eventId}` docs for dedup. Both handler side effects — writing `consent.marketing.status = 'revoked'` and the cross-provider `mailer.remove()` — are naturally idempotent, so a provider retry or duplicate parent fan-out re-runs to the same end state with no extra side effects. (This is the key difference from `payments-webhooks`, where dedup is load-bearing because payment side effects are NOT idempotent.) Events with no `eventId` are now processed instead of skipped, since dedup is no longer required. Removed `marketing-webhooks` from the test runner's pre-test cleanup list (`src/test/test-accounts.js`). Consumers with an existing `marketing-webhooks` collection can safely delete it — nothing reads or writes it anymore.

### Fixed

- **`libraries/infer-contact.js`: guard the optional `assistant` arg.** All log/error calls now use `assistant?.` so `inferContact(email)` works without an assistant. Previously threw a `TypeError` when `BACKEND_MANAGER_OPENAI_API_KEY` was unset and no assistant was passed.
- **`libraries/email/marketing/index.js`: gate `Marketing.remove()` behind test mode.** `remove()` now short-circuits with `if (assistant.isTesting() && !process.env.TEST_EXTENDED_MODE) return {}`, matching `add()` and `sync()`. Closes a gap where auth `onDelete` (fired ~44× at test startup during user cleanup) could hit the live SendGrid/Beehiiv remove APIs during a normal test run. The gate lives at the library SSOT so every caller (onDelete, webhook processors, contact-delete route) inherits it.

### Changed

- **Signup timestamps stamped from Firebase Auth `creationTime`.** Both write paths — the `onCreate` auth event (`src/manager/events/auth/on-create.js`) and the `user/signup` fallback route (`src/manager/routes/user/signup/post.js`) — now set `metadata.created` and `consent.{legal,marketing}.grantedAt`/`revokedAt` from `user.metadata.creationTime` instead of "now"/request-time. The OMEGA user migration treats Auth's `creationTime` as the SSOT and reconciles every doc against it; the prior few-seconds drift meant every new signup got re-fixed on the next migration run. Stamping from `creationTime` makes new docs match the migration's expected value exactly, ending the recurring churn.
- **`user/signup`: `flags.signupProcessed` is the sole idempotency gate.** Removed the 5-minute account-age reject (`MAX_ACCOUNT_AGE_MS`). A genuinely-unprocessed account can now complete signup whenever it retries — fixes the failure where a slow/missing `onCreate` plus a retry after 5 minutes caused a legitimate signup to be rejected. The frontend (UJM) gate is being moved to the same doc flag in a parallel change.
- **CLI: port-conflict prompt auto-confirms after 5s.** The "Kill these processes to free the ports?" prompt in `src/cli/commands/base-command.js` now auto-confirms `Y` after 5 seconds of no input (via `AbortSignal.timeout` → `AbortPromptError` → default `true`), so unattended test/dev loops (`emulator`, `serve`, `test`) no longer hang waiting for input. Manual `y`/`n` and Ctrl+C still work.
- **`AI` `claude-code` provider rewritten for serverside use** (`src/manager/libraries/ai/providers/claude-code.js`). Was a local-only wrapper around `@anthropic-ai/claude-agent-sdk` that spawned the `claude` binary (`forceLoginMethod: 'claudeai'`, keychain OAuth) — would not run in Cloud Functions. Now calls the Claude Messages API over plain HTTPS via `@anthropic-ai/sdk` using the OAuth token as `Authorization: Bearer` + `anthropic-beta: oauth-2025-04-20`, so it bills the Claude Pro/Max subscription (not API credits) and runs anywhere Node runs. Token resolution: `options.apiKey` → `config.claude_code.oauth_token` → `process.env.CLAUDE_CODE_OAUTH_TOKEN`. Renewal is a manual yearly `claude setup-token` (no auto-refresh). Verified live (text + JSON-schema paths). See `docs/ai-library.md`.
- **Dependency bumps**: `@anthropic-ai/claude-agent-sdk` ^0.3.152 → ^0.3.153, `stripe` ^22.1.1 → ^22.2.0.
- **`templates/_.env`**: consolidate OpenAI/Anthropic keys under an "AI" section and add `CLAUDE_CODE_OAUTH_TOKEN`.
- **Marketing webhook tests** (`test/routes/marketing/webhook.js`): renamed `*-duplicate-event-skipped` → `*-reprocessed-idempotently` (assert re-delivery reprocesses and the user stays revoked); `sendgrid-event-without-eventId-*` now asserts the event is processed; beehiiv idempotency variant skips when no publication is configured. Updated `docs/consent.md` and `docs/test-framework.md` to describe the no-ledger design.

# [5.2.12] - 2026-05-27

### Changed

- **`before-signin`: move `activity.language` from `geolocation` to `client`.** In `src/manager/events/auth/before-signin.js`, the `language` field (sourced from `context.locale`) now lives under `activity.client` alongside `userAgent`, instead of under `activity.geolocation` alongside `ip`. Language is a client-side property (browser/locale) rather than an IP-derived geolocation property, so this aligns the before-signin write shape with the rest of the activity schema.

# [5.2.11] - 2026-05-27

### Added

- **CLI: bare `logs` is now an alias for `logs:read`.** `npx mgr logs [...flags]` now dispatches to the same handler as `npx mgr logs:read`, so callers (humans and AI assistants alike) no longer error out when they omit the `:read` suffix. Routing in `src/cli/index.js` accepts the bare `logs` option, and `src/cli/commands/logs.js` maps the bare subcommand to the `read` action. `logs:tail` and `logs:stream` are unchanged.

# [5.2.10] - 2026-05-26

### Added

- **`POST /admin/post`: resize images at ingest.** Downloaded post images are now checked against `IMAGE_MAX_DIMENSION` (4096px on the long edge) in `src/manager/routes/admin/post/post.js` and re-encoded as progressive JPEG at `IMAGE_JPEG_QUALITY` (80) when oversized. Prevents downstream Jekyll/imagemin pipelines from stalling on huge sources (a real 16384×10576 source decoded to ~520MB raw and silently broke 4 StudyMonkey posts on production). `resizeImage`, `IMAGE_MAX_DIMENSION`, and `IMAGE_JPEG_QUALITY` are exported for tests. Adds `sharp` as a dependency.
- **`test/routes/admin/post-resize-image.js`** — 7 unit tests covering the resize contract (pass-through under the limit, boundary at exact limit, landscape/portrait/square scaling, the 16384×10576 case, on-disk overwrite). No network, no auth, no GitHub.
- **`test/routes/admin/create-post.js`**: extended `create-post-rewrites-body-images` to submit a 5000×3000 header image, plus new `verify-oversized-header-image-was-resized` step that fetches the committed image back from GitHub and asserts long edge ≤ 4096px.

### Changed

- **Dependency bumps**: `sharp` ^0.34.4 → ^0.34.5, `sanitize-html` ^2.17.3 → ^2.17.4 (auto-bumped at install).

# [5.2.9] - 2026-05-25

### Added

- **OpenAI provider: multi-role prompt array support.** `options.prompt` now accepts either the legacy object form (`{ path|content, settings }`, auto-wrapped as a single `system`-role segment per the OpenAI Model Spec) OR an array form (`[{ role, path|content, settings }, ...]`) where each segment becomes its own message with its declared role. Valid roles: `system`, `developer`, `user`, `assistant`; order is preserved; role defaults to `system` if omitted; invalid roles throw. New internal helpers `normalizePrompt()` + `VALID_PROMPT_ROLES` canonicalize input; the request pipeline threads `promptSegments` end-to-end (per-segment load, per-role logging, per-segment error surfacing, `formatHistory` unshifts segments in declared order). `module.exports._internals` exposes `normalizePrompt`, `formatHistory`, `VALID_PROMPT_ROLES` for unit tests — not part of the public API. Backwards compatible: existing callers passing `prompt: { content: '...' }` are auto-wrapped as a single `system` segment with no consumer changes.
- **`test/helpers/ai-request-payload.js`** — 16 standalone tests covering the BEM → OpenAI payload transformation with no network and no assistant. Exercises `normalizePrompt` (undefined/null/empty handling, legacy object → single system segment, array-form role preservation, role-defaulting, invalid-role throw, full OpenAI Model Spec role coverage) and `formatHistory` (single-system emit, multi-segment order, empty-array → user-only, prompt+history+new-user interleaving, assistant `output_text` typing, history limit, `dedupeConsecutiveRoles` trailing-user drop, content trim/strip).

### Changed

- **Default OpenAI model bumped to `gpt-5.4-mini`** (was `gpt-5-mini`). Updated in `src/manager/libraries/ai/providers/openai.js` (`DEFAULT_MODEL`), `src/manager/libraries/ai/index.js` (usage example in JSDoc), and `src/manager/libraries/infer-contact.js` (`inferContactWithAI`). The pricing table in the OpenAI provider already includes `gpt-5.4-mini`, so no further config changes are required.
- **`inferContactWithAI` maxTokens doubled to 2048** (was 1024). Gives the model headroom for the richer multi-field contact response without truncation.

# [5.2.8] - 2026-05-25

### Changed

- **`/user/signup` precedence flip for `activity.client`.** `routes/user/signup/post.js` now spreads `assistant.request.client` FIRST and `settings.context.client` (the browser's `getContext()` payload) LAST, so the browser-supplied values win for the `client` block. `activity.client.language` is now `navigator.language` (e.g. `en-US`) instead of the raw `Accept-Language` header list (e.g. `en-US,en;q=0.9,fr;q=0.8`); falls back to the header when no browser context was sent (bots, non-browser clients). `activity.geolocation` precedence is unchanged — Cloudflare headers (`cf-ipcountry`, etc.) still win, since the browser doesn't know its own geo. Final shape mirrors `assistant.request`: geolocation is header-authoritative, client is browser-authoritative.

# [5.2.7] - 2026-05-24

### Fixed

- **`inferContact` silent-failure logging.** When the AI inference returned an empty result (either the AI call failed and returned null, or `gpt-5-mini` returned a parsed response with all-empty fields, or the response shape was missing `firstName`), the whole flow silently swallowed the failure and the signup's `user.personal.name` got written as `null`/`null`. Confirmed live on Somiibo: signed up `ian.wiedenman.business@gmail.com` twice on the same backend — first signup inferred nothing (empty name written), second signup correctly inferred "Ian Wiedenman". Same email, same code, transient AI hiccup, zero log trail. Added three unconditional diagnostic logs to `src/manager/libraries/infer-contact.js` (AI returned null, AI parsed response had all fields empty, AI response missing firstName) plus a log in `src/manager/routes/user/signup/post.js#inferUserContact` when the helper returns null. Next silent failure will at least leave a breadcrumb.

# [5.2.6] - 2026-05-24

### Added

- **`scripts/test-helper-providers.js`** — small CLI for live-test verification. Run from any consumer's `functions/` dir: `node <bem>/scripts/test-helper-providers.js find <email>` (check SendGrid + Beehiiv state without dashboards) or `purge <email>` (remove from both providers). Used during end-to-end consent-pipeline testing.
- **Email-template namespacing.** `general/email` route now translates `:` in `settings.id` to a folder separator, so `general:download-app-link` resolves to `templates/general/download-app-link.js`. Existing `templates/download-app-link.js` moved into `templates/general/` to match.

### Changed

- **Payment webhook + dispute-alert routes now accept either `BACKEND_MANAGER_WEBHOOK_KEY` (preferred) or `BACKEND_MANAGER_KEY` (legacy).** Phase 1 of the webhook-key migration plan in `TODO-WEBHOOK-KEY-UPGRADE.md` — non-breaking dual-acceptance so consumers can roll over at their own pace. `src/manager/routes/payments/webhook/post.js:28` + `src/manager/routes/payments/dispute-alert/post.js:20` validate against either env var. Test-processor self-fire in `src/manager/routes/payments/intent/processors/test.js:158` now uses `BACKEND_MANAGER_WEBHOOK_KEY` directly. All 13 payment test files (`test/routes/payments/*.js`, `test/events/payments/journey-*.js`) updated to use `BACKEND_MANAGER_WEBHOOK_KEY` for webhook URLs. `src/test/utils/http-client.js` + `src/test/runner.js` thread the new env var through the test context. `docs/stripe-webhook-forwarding.md` reflects the dual-key acceptance. Phase 2 (drop the legacy fallback) is tracked in `TODO-WEBHOOK-KEY-LEGACY-REMOVAL.md`.
- **`npx mgr emulator` no longer wraps the emulator in a keep-alive subprocess.** Previously spawned a sleep-86400 wrapper via `runWithEmulator`; now spawns the emulator child directly and uses a clean SIGINT handler. Cleaner shutdown, no orphaned subprocesses, no `node-powertools` dep on the boot path. `npx mgr test`'s auto-start path uses the same helper.

### Fixed

- **Finished the v5.2.3 SendGrid timeout bump that missed 5 sites.** v5.2.3's CHANGELOG claimed "All 9 fetch sites updated" but actually 5 sites in `sendgrid.js` (including `upsertContacts:118` — the hot path used by `Marketing.sync()`) were still using `timeout: 15000`. Confirmed live on Somiibo: a signup with marketing consent granted silently dropped both SendGrid and Beehiiv with `Request timed out` after ~18s. Now every API call in `sendgrid.js` goes through the `SENDGRID_TIMEOUT_MS` (60s) constant. The only remaining literal is the S3 CSV download in `getSegmentContacts:578` (30s — not a SendGrid API call).
- **`beehiiv.js` timeouts unified under a new `BEEHIIV_TIMEOUT_MS` (60s) constant.** Two hot-path sites (`addSubscriber:71` and the unsub endpoint at `:455`) were still on `timeout: 15000`. Same silent-drop failure mode as SendGrid above. Every Beehiiv API call now uses the constant.
- **Audited entire BEM codebase for short timeouts. Zero prod-path timeouts under 60s remain.**
  - **Bumped 6 sites from 10-15s → 60s:**
    - `src/manager/libraries/email/validation.js:136` — ZeroBounce mailbox check
    - `src/manager/libraries/email/generators/newsletter.js:520, 549` — parent-server `/newsletter-sources` GET + PUT
    - `src/manager/routes/payments/intent/processors/test.js:163` — test-processor self-fire webhook
    - `src/manager/routes/marketing/email-preferences/post.js:169, 179` — SendGrid ASM suppression POST + DELETE
  - **Bumped 9 sites from 30s → 60s:**
    - `src/manager/libraries/infer-contact.js:46` — PeopleDataLabs AI enrichment
    - `src/manager/libraries/email/providers/sendgrid.js:578` — S3 CSV download for segment exports
    - `src/manager/functions/core/actions/api/user/delete.js:34` + `src/manager/routes/user/delete.js:51` — internal sign-out fan-out
    - `src/manager/events/firestore/payments-webhooks/analytics.js:228, 301` — Facebook + Reddit Conversions API
    - `src/manager/routes/user/oauth2/providers/discord.js:25` + `…/google.js:30` — OAuth token-revoke
    - `src/manager/helpers/analytics.js:331` — itwcw-package-analytics event fire
  - **Bumped 2 sites from 30s → 120s:**
    - `src/manager/events/cron/daily/ghostii-auto-publisher.js:106` — gpt-image-1 hero image generation (regularly 30-60s)
    - `src/manager/events/cron/daily/ghostii-auto-publisher.js:177` — gpt-5+web-search blog post generation (regularly 60-90s)
- **Audit rule going forward:** any external-API call in BEM prod paths uses **60s minimum** (120s+ for LLM/image generation). Short timeouts are silent-failure machines in serverless code where Cloud Function timeouts already give us a generous outer bound. `_legacy/` files, `src/test/` infra, and `src/cli/` commands keep their existing timeouts — they're not on the request hot path.

# [5.2.5] - 2026-05-22

### Added

- **`utilities.trim(input)`** in `src/manager/helpers/utilities.js`. Walks objects/arrays recursively and trims whitespace on every string. Does NOT strip HTML. Middleware uses it to clean up incoming request data without mangling URLs, Markdown, or any payload with `<`/`>`/`&`.
- **`findContact(email)`** on the SendGrid + Beehiiv providers, and **`findSubscriber(email, publicationId)`** on Beehiiv. Both extracted from the existing `removeContact`/`removeSubscriber` search-by-email logic so tests (and other call sites) can verify provider state without forcing a delete.
- **`test/marketing/consent-lifecycle.js`** — 5-phase live integration test (gated on `TEST_EXTENDED_MODE=true`) that walks two long-lived sentinel accounts through pre-check → sync → declined-stays-out → unsubscribe → validation-gate, asserting actual SendGrid + Beehiiv state at every step. Uses `pollProvider()` to handle SendGrid's async background jobs (upsert/delete can take 10-60s+ to surface).

### Changed

- **Middleware no longer strips HTML by default.** The auto-`sanitize-html` pass on incoming request data was mangling legitimate input — URL query strings (`?a=1&b=2` → `?a=1&amp;b=2`), Markdown, and any payload containing `<`/`>`/`&`. The middleware now only trims whitespace by default. HTML sanitization is opt-in per route via `Manager.Middleware(req, res).run('route', { sanitize: true })`. Sanitize at the HTML-insertion site (`utilities.sanitize()` in your template/email render) rather than at the request boundary. The existing schema-level `sanitize: false` opt-out still works when route-level sanitize is on.
- **Test sentinel accounts `consent-granted` and `consent-declined` now use the `_test.allow_*` prefix** (`_test.allow_consent-granted@...`, `_test.allow_consent-declined@...`). The `_test.*` validation block from v5.2.3 also blocks the previous `_test.consent-*` names from reaching providers — `_test.allow_*` is the carved-out exception specifically for live-provider integration tests.
- **Beehiiv API timeouts bumped to 60s** on the two remaining stragglers (`findSubscriber`, `resolveSegmentIds`) to match the SendGrid+Beehiiv 60s convention from v5.2.3.

### Removed

- **`cleanupMarketingProviders()` function and its pre-run/post-run hooks** in `src/test/test-accounts.js` + `src/test/runner.js`. No longer needed — the validation gate added in v5.2.3 blocks `_test.*` emails from reaching SendGrid + Beehiiv upstream, so there's nothing to clean up. The new `consent-lifecycle.js` test (which intentionally round-trips real contacts via `_test.allow_*`) manages its own pre-check force-clean inline.

# [5.2.3] - 2026-05-22

### Added

- **`marketing.sendgrid.listId` in `templates/backend-manager-config.json`.** Empty-string placeholder for OMEGA's `sendgrid/ensure/list.js` to populate at brand-onboarding time. Mirrors the existing `marketing.beehiiv.publicationId` convention.
- **`_test.*` local-part block** in `src/manager/libraries/email/data/blocked-local-patterns.js`. Test-suite accounts (`_test.<scenario>@somiibo.com`) are now blocked from reaching SendGrid + Beehiiv. The carved-out exception is `_test.allow_*` — used for live-provider integration tests that intentionally need to round-trip a real contact.

### Changed

- **`Marketing.add()` and `Marketing.sync()` now use the full `validate()` pipeline** instead of just `isCorporate()`. Single SSOT for "is this a valid marketing email" — runs format → disposable → corporate → localPart in one call. Stricter behavior: disposable-domain emails (mailinator etc.) and junk local-parts (`noreply`, `test*`, `_test.*`) are now blocked from marketing lists. They were previously waved through because the gate only checked corporate domains.
- **SendGrid list-ID lookup is now config-only.** `src/manager/libraries/email/providers/sendgrid.js#getListId()` reads `Manager.config.marketing.sendgrid.listId` and returns null if missing — no more runtime API call, no more fuzzy-match-by-brand-name. Old fuzzy logic kept commented out as `getListIdByFuzzyMatch()` backstop. **Brands must run OMEGA's sendgrid service to populate `listId` before this version sees their list assignments work** (without it, contacts land in SendGrid's global "All Contacts" pool, not the brand list).
- **Beehiiv publication-ID lookup is now config-only.** `src/manager/libraries/email/providers/beehiiv.js#getPublicationId()` reads `Manager.config.marketing.beehiiv.publicationId` and returns null if missing — same shape as SendGrid above. Old fuzzy logic kept commented out as backstop. Beehiiv side already preferred config when set, but now there's no API fallback.
- **`marketing.beehiiv.publicationId` is now an always-present empty string in the config template** (was a commented-out hint). Matches the SendGrid `listId` shape and means `Manager.config.marketing.beehiiv.publicationId` always returns `""` (never `undefined`) for legacy brands.
- **SendGrid API timeouts bumped from 10s → 60s** via a new top-level `SENDGRID_TIMEOUT_MS` constant in `sendgrid.js`. All 9 fetch sites updated. Catches the intermittent SendGrid backend hiccups that were dropping signups silently with "Request timed out".

# [5.2.2] - 2026-05-21

### Added

- **`consent` is now a protected user field.** `templates/firestore.rules` includes `consent` in `isWritingProtectedUserField()` so a logged-in user cannot retroactively forge their own consent record from the client — only the signup route + webhook processors can mutate it server-side. New rule test in `test/rules/user.js`.
- **`BaseCommand.getLogsPath(name)` / `getTempPath(name)`** in `src/cli/commands/base-command.js`. Two explicit helpers so the folder convention is the SSOT and easy to change later. `getLogsPath()` writes human-readable logs (`serve.log`, `emulator.log`, `test.log`, `logs.log`) to `<projectDir>/functions/` alongside firebase-tools' own `*-debug.log` files. `getTempPath()` writes transient internal-only stuff (`*.log.reset` sentinels, `bem-reload-trigger.js`, `test-mode.json`) to `<projectDir>/.temp/`.
- **`BaseCommand.sweepStaleLogs()`** wipes BEM's own `.log` files in `functions/` and `.reset` sentinels in `.temp/` on every emulator/serve boot and on `npx mgr setup`. Deliberately does NOT touch firebase-tools' debug logs (`firestore-debug.log`, `database-debug.log`, etc.) so users can grep them after a crash.
- **`npx mgr setup` cleanup step.** `cleanupGeneratedArtifacts()` now removes the watch trigger file (existing behavior) plus calls `sweepStaleLogs()` to clean up old BEM-owned logs/sentinels from previous runs.

# [5.2.1] - 2026-05-21

### Added

- **`BACKEND_MANAGER_WEBHOOK_KEY` in `templates/_.env`.** The `.env` scaffold the setup CLI copies into consumer projects now declares the webhook key alongside `BACKEND_MANAGER_KEY`. Required for the new `/marketing/webhook` + `/marketing/webhook/forward` routes shipped in 5.2.0. Existing consumers should add it to their own `.env` manually.

# [5.2.0] - 2026-05-21

### Added

- **Marketing consent capture (Phase A-B).** Canonical `consent.{legal,marketing}` sub-tree on every user doc (`status` + `grantedAt` / `revokedAt` with timestamp/source/ip/text). Signup route (`src/manager/routes/user/signup/post.js`) builds the record from the client payload using server-side time + IP, defending against client-clock spoofing. `mailer.sync(uid)` is gated on `consent.marketing.status === 'granted'` — opted-out signups never enter SendGrid/Beehiiv marketing lists.
- **Email-preferences route (Phase D).** `POST /marketing/email-preferences` now supports authenticated opt-in/opt-out (writes user doc + hits both providers via `email.sync()`/`email.remove()`) in addition to the existing HMAC anonymous unsub flow. Anonymous unsub also writes the consent revoke on the user doc with the right `source`.
- **Cross-provider unsubscribe webhooks (Phase E).** New `POST /marketing/webhook?provider={sendgrid|beehiiv}&key=...` dispatcher with per-provider processor modules. SendGrid events (`unsubscribe`, `group_unsubscribe`, `spamreport`, `bounce`, `dropped`) and Beehiiv events (`subscription.unsubscribed`, `.deleted`, `.paused`) flip `consent.marketing.status` to `revoked`, attribute via `source`, and propagate to the OTHER provider. Idempotent via `marketing-webhooks/{eventId}` docs.
- **Parent BEM forwarder.** `POST /marketing/webhook/forward` lets a parent BEM (one with `config.parent === 'self'`) fan webhook events out to sibling brands sharing a SendGrid account or Beehiiv publication. New `Manager.getParentUrl()`, `Manager.getParentApiUrl()`, `Manager.isParent()` helpers — children store the parent's `brand.url` with NO `api.` subdomain and the helper inserts `api.` at call time.
- **Self-contained TEST_EXTENDED_MODE.** `src/test/runner.js` + `src/test/test-accounts.js` now do pre + post-run cleanup of SendGrid/Beehiiv contacts (the only third-party state we can't wipe at start). Pure Firestore/Auth state is still wiped only at start, per existing convention.
- **New docs.** `docs/consent.md` (consent system + webhook flows + migration template). `docs/test-framework.md` updated with the post-run-cleanup exception.

### Changed

- `src/test/runner.js`, `src/test/utils/http-client.js`, `src/cli/commands/test.js`, plus emulator/serve/watch CLIs: renamed `hostingUrl` → `apiUrl` to match the rest of the codebase. Touches most test files for the matching context-API rename.
- `src/manager/libraries/email/generators/newsletter.js`: uses `Manager.getParentApiUrl()` instead of reading `Manager.config.parent` directly so the `'self'` sentinel and the missing `api.` subdomain are both handled in one place.
- `src/manager/libraries/email/providers/beehiiv.js`: exposes `getPublicationId` so generators and tests can read it without reaching into the module.
- Disposable-domain blacklist refreshed (8 new domains) via `prepare-package`'s pre-hook.

### Fixed

- `mailer.sync()` and `mailer.add()` short-circuit when the target user's `consent.marketing.status === 'revoked'` so we never re-add an opted-out user.
- Payment processor + cancel route touchups picked up by the runner-API rename pass — no behavior change, just keeping signatures aligned.

# [5.1.4] - 2026-05-18

### Fixed

- **`POST /admin/post` response `path`** now returns the full `.md` file path (e.g. `src/_posts/2026/guest/2026-05-14-my-post.md`) instead of the parent directory. Consumers (e.g. the sponsorship system) were treating it as a file path — which it was named to be — and downstream deletes failed with `"sha" wasn't supplied` because GitHub got a directory listing. The parent directory is now exposed separately as `directory` for consumers that still want it. Updated `test/routes/admin/create-post.js` accordingly.

# [5.1.3] - 2026-05-18

### Added

- **Live `TEST_EXTENDED_MODE` sync between `npx mgr test` and the running emulator.** Test command writes an allowlisted env subset to `<projectRoot>/.temp/test-mode.json` pre-flight; emulator's function workers watch the file via `fs.watch` and mutate their own `process.env` in place — flag flips take effect within ~50ms with no env coordination across terminals. No more "restart the emulator with `TEST_EXTENDED_MODE=true`" dance. Health endpoint re-reads the file as a freshness guard. New helper `src/test/utils/test-mode-file.js` is the SSOT for the file format and allowlist.
- **Real BEM Manager in test contexts.** `run-tests.js` sets `BEM_TEST_RUNNER=1` before loading any BEM code; `Manager.init()` auto-detects this and skips Functions/server/Sentry wiring + `admin.initializeApp()` (which can't run outside a real Functions runtime). Result: tests receive `{ Manager, assistant }` in their context and can call `Manager.AI()`, `Manager.Email()`, `Manager.User()`, etc. exactly like production — no hand-rolled stubs.
- **Newsletter markdown + summary outputs.** `lib/markdown-renderer.js` walks the same `structure` JSON the HTML is rendered from (no AI cost) and emits `newsletter.md` — each section/dispatch is a standalone `## heading` block ready to paste into Beehiiv's editor one block at a time with ad blocks inserted between dispatches. A separate `summary.md` (2-3 sentence editorial recap) is written alongside.
- **`summary` and `tags` fields on the structure schema.** `summary` is ≤600 chars, used for the `summary.md` body and as a share snippet (distinct from preheader, which is an inbox hook). `tags` is 0-5 lowercase kebab-case topical tags, passed to Beehiiv's `content_tags` on draft creation.
- **GitHub asset host writes MD + summary alongside HTML.** `lib/image-host.js` accepts `markdown` + `summary` parameters and uploads `newsletter.md` / `summary.md` to `{brandId}/{campaignId}/` in the same atomic two-commit upload as PNGs + HTML. URLs surface on `assets.markdownUrl` / `assets.summaryUrl`.
- **Beehiiv fallback alert email.** When Beehiiv draft creation fails (e.g. free-plan `SEND_API_NOT_ENTERPRISE_PLAN`), the generator sends an internal alert via `sender: 'internal'` (alerts@{brandDomain}) to `brand.contact.email` containing the failure reason + subject/preheader/tags + direct links to HTML/MD/summary/folder. The newsletter is never stuck. Best-effort; failure to send is logged but never blocks the Firestore campaign-doc write.
- **Universal AI system-prompt injections.** `Manager.AI()` `normalizeOptions()` now prepends two rules (em-dash ban, confidentiality) to every system prompt — every caller picks them up automatically.
- **GPT-5 Codex family pricing** (`gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex`, `gpt-5.1-codex-mini`, `gpt-5-codex`, `codex-mini-latest`) added to the OpenAI provider's MODEL_TABLE.
- **`docs/common-mistakes.md`** and **`docs/key-files.md`** — extracted from CLAUDE.md to keep the architectural overview under 250 lines.

### Changed

- **SVG illustrator default flipped to `gpt-5.3-codex`.** Codex is the markup/code-specialized GPT-5 variant; SVG is structured markup, so it's the right fit. Anthropic remains supported as a fallback provider.
- **`structure` schema now requires `summary` and `tags`.** Existing generators pick these up automatically — the AI prompt was updated to instruct on both.
- **CTAs removed from generated section bodies.** The AI cannot author URLs reliably (no browse access, no real source URLs), so any link it produced was invented. Newsletters are self-contained reads; outbound links come exclusively from the template shell's sponsorship blocks (`marketing.beehiiv.content.sponsorships[]`). Test fixtures updated.
- **CLAUDE.md restructured** into the standard skeleton (Identity → Recommended skills → Quick Start → Architecture → CLI → File Conventions → Doc-update parity → Documentation index). Per-subsystem details extracted to `docs/`.
- **Consumer default CLAUDE.md** updated for the new `logs:read` / `logs:tail` / `firestore:*` / `auth:*` CLI commands.
- **Runner mode reporting.** The old `TEST_EXTENDED_MODE mismatch` warning is gone (made impossible by the live sync) — replaced with a "Mode: EXTENDED/normal" line sourced from the emulator's health-endpoint confirmation.

# [5.1.2] - 2026-05-14

### Changed

- **Broadened `test` / `example` local-part blocks** in `email/data/blocked-local-patterns.js`:
  - `/^test[._-]/` → `/^test/` — now catches `testuser`, `test123abc`, etc., not only `test.user` / `test_123` / `test-foo`.
  - Added `/^example/` — catches `example`, `exampleuser`, `example.user`, `examples`, etc.
  - Both patterns are anchored to the start of the local part, so legitimate addresses that contain (but don't start with) those substrings are still allowed: `rachel.tester`, `contestant`, `exam` all pass.

# [5.1.1] - 2026-05-13

### Added

- **Corporate / social-media domain blacklist** — new `corporate` check in `email/validation.js` blocks marketing-list adds from corporate social-media domains (meta.com, instagram.com, soundcloud.com, tiktok.com, x.com, reddit.com, linkedin.com, youtube.com, discord.com, telegram.org, signal.org, and more — 21 domains total). Added to `DEFAULT_CHECKS` so every existing caller of `validate()` picks it up automatically. New `isCorporate(emailOrDomain)` helper exported alongside `isDisposable()`.
- **Defense-in-depth guards** in `Marketing.add()` and `Marketing.sync()` — even when validation is bypassed (e.g. testing mode), corporate domains are blocked before any Beehiiv or SendGrid call.
- **13 new tests** in `test/helpers/email-validation.js` covering the `corporate` validate-check, the `isCorporate()` helper, case-insensitivity, edge cases, and check-ordering behavior. Suite: 44 pass, 0 fail, 2 skip (ZeroBounce-only).

### Changed

- **Email data files reorganized** — all blacklists now live in `src/manager/libraries/email/data/` (one folder, next to their consumer), instead of being scattered one level up alongside unrelated libraries:
  - `disposable-domains.json`, `custom-disposable-domains.json`, `corporate-domains.json` — domain blocklists
  - `blocked-local-parts.json` — categorized local-part blocklist (`generic`, `system`, `junk`, `placeholder`), extracted from a hardcoded `Set` in `validation.js`
  - `blocked-local-patterns.js` — regex patterns, extracted from `validation.js` (kept as JS so RegExp literals stay native)
- **`scripts/update-disposable-domains.js`** — prepare-step downloader now writes to `email/data/disposable-domains.json`.

# [5.1.0] - 2026-05-13

### Added

#### Newsletter generation system
- **Three production-quality templates** with distinct aesthetics, each owning its own content schema and AI prompt — switching templates produces fundamentally different content, not a recolor:
  - `clean` — Stripe/Linear marketing aesthetic. Safe, conservative, works everywhere.
  - `editorial` — Magazine-style: masthead, drop-cap intro, numbered sections, pull-quotes, italic signoff.
  - `field-report` — Wire-service correspondent × Bloomberg terminal. Dispatch kickers, datelines, mono data callouts, end-of-dispatch terminators, correspondent signoff.
- **Schema-per-template architecture** (`lib/structure.js` is now a generic dispatcher). `BASE_SCHEMA` declares universals (subject, preheader, signoff, citations); each template extends with its own fields via `schema.properties` + `schema.required`. `clean` + `editorial` share `CLASSIC_SCHEMA` (`{intro, sections: [{title, body, cta?, image_prompt}]}`); `field-report` declares `{tldr, dateline, dispatches: [{kicker, headline, byline, location, lede, dispatch, dataPoints, cta, image_prompt}]}`.
- **Templates export `buildPrompt({brand, newsletterConfig, sources})`** — each template fully owns its AI brief. `clean` + `editorial` use the shared classic prompt; `field-report` has its own wire-service-correspondent voice.
- **Graceful omission everywhere** — every template's `build()` handles missing optional fields (returns `''` for omitted blocks instead of throwing). Empty sections/dispatches drop entirely (no hollow stubs).
- **Asset hosting pipeline (`lib/image-host.js`)** — `uploadAssets({ images, html, brandId, campaignId, subject })` uploads section PNGs + `newsletter.html` to `itw-creative-works/newsletter-assets/{brandId}/{campaignId}/` via Git Trees API. PNG magic-byte verification + strict path regex. Public-safety guarantees baked in.

#### Daily cron pipeline (production-ready)
- **`marketing-newsletter-generate.js` now runs the FULL pipeline end-to-end**: fetch sources → AI structure → AI SVG → upload PNGs to GitHub → render HTML with embedded CDN URLs → upload `newsletter.html` to the same folder → upload Beehiiv draft (fails gracefully on free plan with `SEND_API_NOT_ENTERPRISE_PLAN`) → write `marketing-campaigns/{newId}` Firestore doc with `assets: { folderUrl, htmlUrl, imageUrls, beehiivPostId, campaignId }`.
- **Reserved Firestore doc ID is used as the GitHub folder name** so URLs and the campaign doc always match.

#### Unified AI library
- **`src/manager/libraries/ai/`** — `Manager.AI(assistant).request({ provider: 'openai' | 'anthropic' | 'claude-code', ... })` dispatches to either provider with a consistent options + return shape. OpenAI is the default (back-compat); Anthropic added for SVG generation; `claude-code` provider added via `@anthropic-ai/claude-agent-sdk` for credit-less subscription-backed generation.
- New env var: `BACKEND_MANAGER_ANTHROPIC_API_KEY` / `ANTHROPIC_API_KEY`.

#### Iteration test as mirror of production
- **Fixture mode is the default** (`npx mgr test bem:marketing/newsletter-generate`) — loads `test/marketing/fixtures/<active-template>.json` and renders straight through MJML. ~35ms, $0, deterministic. Used in CI to catch layout regressions for free.
- **EXTENDED mode** (`TEST_EXTENDED_MODE=1`) is now a TRUE mirror of the production cron: always uploads to GitHub, always tries Beehiiv draft, no per-side-effect opt-outs.
- **Three fixture JSONs** shipped at `test/marketing/fixtures/{clean,editorial,field-report}.json` — one per template, each matching its template's content shape. Convention enforced: adding a new template REQUIRES a matching fixture (default test run fails with `fixture not found` otherwise).
- **17-test fixture suite** (`test/marketing/newsletter-templates.js`) covers graceful omission, empty-section drop, CTA conditional rendering, citation rendering, sponsorship rendering, button padding regression guard, long subjects, minimum-viable structures, template metadata, schema export contract.

#### Other additions
- **`Manager.Utilities().slugify()`** — canonical URL slug builder. Strips non-alphanumeric chars, collapses hyphens, trims, lowercases. Single source of truth shared by admin/post + any consumer that needs to predict slugs (e.g. sponsorship platform).
- **`routes/admin/post/deduplicate-image-alts.js`** — utility that suffixes alt-text when two images share alt-text but have different URLs (prevents filename collisions on upload). Wired into both `routes/admin/post/post.js` and `actions/api/admin/create-post.js`. Unit-tested.
- New env vars in `templates/_.env`: `BACKEND_MANAGER_ANTHROPIC_API_KEY`, `ANTHROPIC_API_KEY`.
- `templates/_.gitignore` now includes `.temp/` in the BEM defaults section.

#### Documentation split
- **CLAUDE.md reduced from ~1500 lines to a navigable table of contents.**
- **21 new `docs/*.md` deep references**: architecture, directory-structure, code-patterns, file-naming, environment-detection, response-headers, routes, schemas, sanitization, auth-hooks, common-operations, admin-post-route, payment-system, marketing-campaigns, mcp, usage-rate-limiting, ai-library, marketing-fields, stripe-webhook-forwarding, testing, cli-firestore-auth, cli-logs.

### Changed

- **Config restructuring**: `marketing.newsletter` → `marketing.beehiiv.content`. Nesting under the provider that publishes the result makes the coupling explicit and leaves room for future `marketing.sendgrid.content` for promo email blasts. `marketing.beehiiv.enabled` now gates the whole content pipeline (no separate `newsletter.enabled` flag — disabling beehiiv disables newsletter generation as a side effect, since there's nowhere for the generated content to land).
- **Marketing library** (`libraries/email/marketing/index.js`) — now prefers `settings.contentHtml` over running the markdown pipeline. Lets generators produce pre-rendered HTML directly. UTM tagging still runs on the chosen HTML either way.
- **`Manager.AI()`** now points to the unified `libraries/ai/index.js`. `libraries/openai.js` is a thin compatibility shim that re-exports `libraries/ai/providers/openai.js`.
- **Footer no longer renders a hand-rolled `${brandUrl}/unsubscribe` link** — Beehiiv and SendGrid both auto-append CAN-SPAM-compliant unsubscribe links on sent emails. The hand-rolled one was a dead second link. Fixture suite now has a regression guard preventing accidental re-adds.
- **Beehiiv provider** (`libraries/email/providers/beehiiv.js`) — `createPost()` accepts an explicit `publicationId` arg (bypasses singleton-Manager lookup); `getPublicationId()` null-guards an uninitialized Manager singleton (matters for test stubs).
- **`admin/post.js` + `actions/api/admin/create-post.js`** — replaced inline slugify implementations with calls to the new `Manager.Utilities().slugify()`. Wired alt-text dedup helper into the post-creation flow.
- **`.temp/` moved** from `functions/.temp/` to project root (matches UJM/BXM/electron-manager convention).
- **`src/defaults/CLAUDE.md`** — strengthened framework-docs callout for consumer projects; clarified the Default/Custom marker boundary.

### Removed

- **`marketing.newsletter.provider/sectionStyle`** — `provider` defaults now live in code (openai for structure, anthropic for SVG), overridable per-run via env vars. `sectionStyle` was a free-form hint string the AI ignored.
- **`marketing.beehiiv.uploadAs`** — vestigial config from the abandoned Beehiiv-send-path detour.
- **`NEWSLETTER_GITHUB_UPLOAD` env flag** — redundant. EXTENDED mode now always uploads (production-equivalent run).
- **Footer's hand-rolled unsubscribe link** (see Changed).

# [5.0.203] - 2026-05-13
### Fixed
- `Settings.resolve()` now surfaces a clear `No schema for <METHOD> request: expected <schema>/<method>.js or <schema>/index.js` error (code 500) when both the method-specific schema (e.g. `delete.js`) and the `index.js` fallback are absent. Previously the raw Node `Cannot find module .../<schema>/index.js` error propagated to consumers, leaking the require stack and surfacing the internal `/workspace/...` deploy path.
- Schema files that exist but throw (syntax error, runtime error) are now re-thrown directly instead of being silently masked by an unintended fallback to `index.js`. The real error surfaces, making bugs in schema files debuggable.

# [5.0.202] - 2026-05-12
### Added
- **`src/defaults/CLAUDE.md`** — new file shipped to consumer projects, marker-wrapped with `# ========== Default Values ==========` / `# ========== Custom Values ==========`. Framework section stays live-synced across `npx mgr setup` while the Custom section is preserved verbatim. Aligns BEM with EM/BXM/UJM, which already ship a consumer-facing default CLAUDE.md.
- **`src/utils/merge-line-files.js`** — new file. Implements the line-based merge for the marker-wrapped Default/Custom sections (copied verbatim from `electron-manager`'s utility). Reusable across `.env`, `.gitignore`, `CLAUDE.md`, and any other line-based files BEM might ship in the future.
- **`copyDefaults()` method** in `src/cli/commands/setup.js`. New defaults-shipping mechanism for BEM (which previously had no `src/defaults/` directory at all). Mirrors EM's `copyDefaults` pattern: iterates `src/defaults/**`, renames `_.foo` → `.foo`, routes files matching `MERGEABLE_BASENAMES` (`['.env', '.gitignore', 'CLAUDE.md']`) through `mergeLineBasedFiles`, copies non-mergeable files only if they don't already exist. Wired into `runSetup()` BEFORE `runTests()` so test inspections see the merged state.

# [5.0.201] - 2026-05-08
### Changed
- Account deletion confirmation email now includes a "Deletion details:" block with the user's account email, UID, and deletion timestamp (UTC) — matching the pattern used in the data-request download email.

# [5.0.200] - 2026-05-05
### Changed
- Bumped `uuid` from `^13.0.2` to `^14.0.0`. uuid v14 is ESM-only, but Node 22+'s native `require(esm)` support means existing CommonJS call sites (`require('uuid').v4`, `.v5`, etc.) work unchanged.

# [5.0.199] - 2026-04-23
### Fixed
- Storage helper (`Manager.storage().get()` / `.set()`) was referencing `_.get` and `_.set` without a lodash namespace import — lodash is destructured at the top of the file, so `_` was undefined and every call crashed. Destructured `get` and `set` (aliased as `_get` / `_set`) and updated both call sites.

# [5.0.198] - 2026-04-10
### Security
- Added Stripe idempotency keys on all Stripe write operations to prevent duplicate charges, refunds, customers, and coupons from webhook retries, concurrent requests, or user double-clicks. Keys are scoped to stable resource identifiers and Stripe caches responses for 24 hours.
  - `bem-dispute-refund-{chargeId}` on auto-refunds from dispute alert Firestore triggers
  - `bem-customer-create-{uid}` on Stripe customer creation
  - `bem-coupon-{couponId}` on coupon creation in the intent route
  - `bem-refund-{resourceId}` on manual subscription refunds

# [5.0.197] - 2026-04-10
### Added
- `--retry=N` flag on `npx mgr setup` — re-runs the full setup sequence up to N times, stopping early as soon as all checks pass. Useful for test cases that only succeed after a prior run creates fixtures or indexes propagate.

# [5.0.196] - 2026-04-10
### Changed
- Moved disposable domain fetch from `prepublishOnly` lifecycle hook to `prepare-package`'s new `hooks.before` config. The fetch now runs on every `npm run prepare` / `npm install` / `npm publish`, so fresh domains land in both the git working tree and the published tarball — no more drift between git and npm.
- Bumped `prepare-package` devDep to ^2.1.0 (required for hooks support)

# [5.0.195] - 2026-04-10
### Fixed
- 24-hour cancellation guard in `payments/cancel` was comparing `Date.now()` (milliseconds) against `startDateUNIX` (seconds), producing an "age" of ~56 years for every subscription — guard never fired and users could cancel brand-new subscriptions. Now multiplies `startDateUNIX` by 1000 before subtraction.
### Changed
- Standardized CLI examples in `CLAUDE.md` and `README.md` to use `npx mgr` instead of the deprecated `npx bm` alias

# [5.0.194] - 2026-04-08
### Fixed
- Fix email template data merge: caller's `settings.data` is now deep-merged at root of template data tree, removing the broken `data.` prefix indirection that caused empty order confirmation emails since 5.0.185
### Added
- `preview` as a top-level setting on `email.send()` (alongside `subject`)
- `logs:read` CLI: `--search`, `--order`, `--filter` flags and increased default limit to 300
### Changed
- Email templates now access caller data at root (`{{order.id}}`, `{{body.message}}`) instead of under `data.*`

# [5.0.192] - 2026-04-02
### Added
- Setup test to create `hooks/auth/` and `hooks/cron/daily/` directories in consumer projects during `npx bm setup`

# [5.0.186] - 2026-04-01
### Fixed
- Move markdown rendering and UTM link tagging to run after `_.merge()` so caller overrides to `body.message` and `email.body` are properly processed

# [5.0.185] - 2026-04-01
### Changed
- Use `_.merge` for dynamic template data so callers can override any nested field (e.g. `email.preview`, `personalization.name`, `data.body.*`)
- Set email schema `template` default to `'default'` instead of `undefined`

# [5.0.184] - 2026-03-31
### Changed
- Renamed email template shortcuts from `main/` to `core/` prefix across constants and all consumer files
- Added new templates: `core/plain` and `core/marketing/promotional`

# [5.0.177] - 2026-03-29
### Changed
- `payment-recovered` transition now sends email to internal team only — customer no longer receives a "Payment received" notification

# [5.0.176] - 2026-03-30
### Fixed
- Chargeblast `alert.created` events use `alertId` instead of `id` — normalizer now accepts either field
- Dispute charge matching now uses `charges.search()` instead of invoice search, fixing cases where Stripe invoices had `charge: null` even when paid (via balance/credit). Single reliable strategy: amount + ±2 day date window + card last4
### Changed
- Dispute `on-write` trigger is now processor-agnostic — Stripe-specific match/refund logic extracted to `processors/stripe.js`, matching the pattern used by payments-webhooks

# [5.0.174] - 2026-03-27
### Fixed
- Payments-orders `metadata.created` timestamp no longer overwritten on subsequent webhook events (renewals, cancellations, payment failures)

# [5.0.168] - 2026-03-21
### Fixed
- Immediately suspend subscription on payment denial (PAYMENT.SALE.DENIED, invoice.payment_failed) instead of waiting for the processor to give up retrying — recovery via PAYMENT.SALE.COMPLETED restores active status

# [5.0.167] - 2026-03-20
### Changed
- Extracted `resolveTemperature()` helper for consistency with `resolveFormatting()` and `resolveReasoning()`

# [5.0.166] - 2026-03-20
### Added
- `reasoning: true` feature flag to GPT-5.x and o-series models in MODEL_TABLE
- New GPT-5.4-mini and GPT-5.4-nano model entries with pricing

### Changed
- Reasoning parameter is now conditionally included in API requests only when the model supports it
- `resolveReasoning()` validates model support and warns when reasoning is requested for unsupported models

# [5.0.165] - 2026-03-20
### Changed
- Serve command now reads hosting port from `firebase.json` emulator config before falling back to default 5000
- Notification test fixtures migrated from flat `createdAt`/`updatedAt` to nested `metadata.created`/`metadata.updated` objects matching standard BEM metadata format

# [5.0.164] - 2026-03-18
### Added
- Default field backfill in campaign seed setup — missing fields are restored from seed defaults without overwriting user edits

# [5.0.163] - 2026-03-18
### Changed
- Refactored campaign POST/PUT routes to generic field passthrough — schema-validated fields flow through automatically via shared `buildCampaignDoc()` utility, no manual field assignments needed
- Extracted `normalizeSendAt()` and `DOC_LEVEL_FIELDS` into `routes/marketing/campaign/utils.js`

# [5.0.161] - 2026-03-18
### Added
- Port conflict detection in `serve` command — checks and kills blocking processes before starting Firebase server

### Changed
- Unblocked common team/role email local parts (`user`, `email`, `mail`, `hello`, `info`, `admin`, `support`, `contact`) from validation blocklist, as these are legitimate addresses

# [5.0.160] - 2026-03-18
### Added
- Beehiiv `resolveSegmentIds()` — fetches segments from API, builds name→ID cache (same pattern as SendGrid)
- Beehiiv segment resolution in `sendCampaign()` — SSOT keys auto-translate to Beehiiv segment IDs

### Changed
- Beehiiv `createPost()` now receives resolved segment IDs instead of raw SSOT keys

# [5.0.159] - 2026-03-18
### Added
- Audience-specific email discount codes: `UPGRADE15`, `COMEBACK20`, `MISSYOU25`, `TRYAGAIN10` with eligibility validation per user
- `{discount.code}` and `{discount.percent}` campaign template variables
- `test: true` flag on campaign route — sends real Single Send to `test_admin` segment only
- `test_admin` segment in SSOT (targets `hello@itwcreativeworks.com`)
- `trial_claimed` custom field (`user_subscription_trial_claimed`) for marketing sync
- `subscription_churned_paid` and `subscription_churned_trial` segments (replaces `subscription_churned`)
- 4 audience-specific recurring sale seed campaigns with tailored messaging + discount codes
- Full marketing campaign system documentation in CLAUDE.md, README.md, and BEM:patterns skill

### Changed
- Template variable resolution now recursive — walks all string values in settings (future-proof)
- UTM values resolved through template vars (`{holiday.name}_sale` → `black_friday_sale`)
- UTM sanitizer strips apostrophes before underscore conversion
- Payment intent + discount routes now pass user object for discount eligibility checking
- Discount code `validate()` accepts optional user param for eligibility checks (backwards compatible)

# [5.0.158] - 2026-03-17
### Added
- Newsletter generator system (`libraries/email/generators/newsletter.js`) — fetches sources from parent server, AI assembles branded content with subject/preheader
- Daily pre-generation cron (`cron/daily/marketing-newsletter-generate.js`) — generates newsletter content 24 hours before sendAt for calendar review
- `marketing.newsletter.enabled` and `marketing.newsletter.categories` config options
- `generator` field on campaign docs — tells cron to run content generation instead of sending directly

### Changed
- Seed campaign IDs are now timing-agnostic: `_recurring-sale`, `_recurring-newsletter`
- Recurrence timing removed from enforced fields — consuming projects can freely change schedule
- Newsletter subject/preheader are now AI-generated (empty in seed template)
- Frequent cron skips generator campaigns (handled by daily pre-generation cron)
- Admin cron route now passes `libraries` to cron handlers

# [5.0.157] - 2026-03-17
### Added
- Campaign template variables via `powertools.template()` — `{brand.name}`, `{season.name}`, `{holiday.name}`, `{date.month}`, `{date.year}`, `{date.full}`
- Separate SEASONS (Winter/Spring/Summer/Fall) and HOLIDAYS (New Year, Valentine's Day, Black Friday, Christmas, etc.) maps
- Audit logging in `getSegmentContacts()` — logs export start, poll status, download count, timeout

### Changed
- Seed sale campaign: quarterly → monthly on 15th, uses `{holiday.name}` template vars, targets free + cancelled + churned users, excludes paid
- Prune cron calls segment export with 3-minute timeout for large segments

### Fixed
- S3 presigned URL download broken by wonderful-fetch cache buster — set `cacheBreaker: false`
- CSV header parsing: normalize to lowercase for case-insensitive column matching

# [5.0.156] - 2026-03-17
### Added
- Marketing campaign system with full CRUD routes (`POST/GET/PUT/DELETE /marketing/campaign`)
- Calendar-backed scheduling: campaigns stored in `marketing-campaigns` Firestore collection, picked up by `bm_cronFrequent`
- Multi-provider campaign dispatch: SendGrid (Single Send) + Beehiiv (Post) + Push (FCM)
- Recurring campaigns with `recurrence` field — cron creates history docs and advances `sendAt`
- Markdown → HTML conversion at send time for campaign content
- UTM auto-tagging on brand domain links for both marketing and transactional emails (`libraries/email/utm.js`)
- Shared notification library (`libraries/notification.js`) extracted from admin route
- SEGMENTS SSOT dictionary in `constants.js` — 22 segments (subscription, lifecycle, engagement)
- Runtime segment ID resolution: `resolveSegmentIds()` maps SSOT keys to SendGrid segment IDs
- Contact pruning cron (`cron/daily/marketing-prune.js`) — monthly re-engagement + deletion of inactive contacts
- SendGrid `getSegmentContacts()` and `bulkDeleteContacts()` for segment export + batch deletion
- Seed campaigns via `npx bm setup`: `_recurring-quarterly-sale` (SendGrid) and `_recurring-weekly-newsletter` (Beehiiv) with enforced fields
- `marketing.prune.enabled` config option (default: true)
- Provider name extraction from OAuth on signup (Google, Facebook, etc.)
- Personalized greetings in welcome, checkup, deletion, and data request emails

### Changed
- `sendCampaign()` refactored for multi-provider dispatch with automatic SSOT segment key → provider ID translation
- `POST /admin/notification` slimmed down to use shared notification library
- Setup test data files (`required-indexes.js`, `seed-campaigns.js`) moved to `helpers/` directory

# [5.0.155] - 2026-03-16
### Added
- Setup test now ensures consuming project `functions/package.json` has `"private": true` to prevent accidental npm publish

# [5.0.154] - 2026-03-16
### Changed
- Add `display` property to all marketing FIELDS entries so display names are defined in the SSOT
- Beehiiv provider now maps fields to display names instead of raw keys
- Add `skip` flag for per-provider field creation control (e.g., SendGrid has first/last name built-in)

### Added
- `user_personal_name_first` and `user_personal_name_last` fields to FIELDS dictionary (skipped for SendGrid which has them built-in)

# [5.0.152] - 2026-03-16
### Fixed
- Email queue documents all stored at `emails-queue/NaN` — `powertools.random()` doesn't support string generation, replaced with `pushid()`

# [5.0.151] - 2026-03-16
### Fixed
- AI contact inference was silently broken — `ai.request()` returns `{content, tokens, ...}` but code read `result.firstName` instead of `result.content.firstName`, so AI was never used
- OpenAI API key not passed to AI library — now explicitly passes `BACKEND_MANAGER_OPENAI_API_KEY`

### Added
- `POST /admin/infer-contact` route for testing/debugging contact inference (admin-only, supports batch)
- `user_personal_company` custom field in FIELDS constant for marketing provider sync
- Company passthrough in `Marketing.add()` → SendGrid and Beehiiv providers
- Test suite for admin/infer-contact route
- Standalone test script (`scripts/test-infer-contact.js`)

### Changed
- Improved AI prompt: rejects placeholders/gibberish, always infers company from domain, preserves hyphenated name capitalization
- Disabled regex fallback — returns empty when AI can't infer a real name
- All 3 inferContact callsites (marketing/contact, user/signup, legacy add-marketing-contact) now extract and pass company

# [5.0.150] - 2026-03-16
### Added
- `marketing` config section in `backend-manager-config.json` — per-brand control over SendGrid and Beehiiv provider availability
- Beehiiv provider reads `publicationId` from config (skips fuzzy-match API call) with in-memory cache

### Changed
- Provider availability resolved once in Marketing constructor from `config.marketing` + env vars instead of per-request
- Removed `providers` parameter from `add()`, `sync()`, `remove()` and all route/schema callers

### Removed
- `DEFAULT_PROVIDERS` constant — no longer needed with config-driven provider resolution
- Provider-selection tests — no longer applicable

# [5.0.149] - 2026-03-14
### Added
- Modular email library (`libraries/email/`) — replaces monolithic `libraries/email.js` with provider-based architecture
- Marketing contact providers: SendGrid (`providers/sendgrid.js`) and Beehiiv (`providers/beehiiv.js`) with add/remove/sync operations
- Email validation library (`libraries/email/validation.js`) — format, local-part, and disposable domain checks with configurable check selection
- Runtime SendGrid custom field ID resolution — fetches field definitions from API and caches name→ID mapping (no hardcoded IDs)
- 15 marketing custom fields synced to SendGrid/Beehiiv: brand, auth, subscription, payment, and attribution data
- `PUT /marketing/contact` admin route for triggering contact sync by UID
- `POST /marketing/contact` now syncs full custom field data on signup
- Marketing contact sync in payment webhook pipeline — subscription changes automatically update SendGrid/Beehiiv custom fields
- `mailer.sync(uid)` method for full contact re-sync from Firestore user doc
- `resolveFieldValues()` in `constants.js` — SSOT for building custom field payloads from user docs
- `User.resolveSubscription()` now includes `everPaid` field for marketing segmentation
- `TEST_EXTENDED_MODE` propagation from emulator to Firebase function workers
- `TEST_EXTENDED_MODE` mismatch detection between test runner and emulator via health check
- Email queue cron processor (`cron/frequent/email-queue.js`) — processes deferred emails every 10 minutes via the full `email.send()` pipeline
- Feedback route review URL builder with full site URLs
- 28 email validation unit tests, 7 marketing contact route tests, 5 marketing lifecycle integration tests

### Changed
- Refactored `libraries/email.js` into modular `libraries/email/` directory (index, constants, validation, providers)
- `POST /marketing/contact` validation now uses configurable check selection instead of boolean `skipValidation`
- `DELETE /marketing/contact` uses new provider-based removal
- Marketing contact schemas updated to match new validation options
- `on-delete` auth event now uses new email library for contact removal
- `saveToEmailQueue` now stores raw settings instead of pre-built SendGrid email, so queued emails re-enter the full build pipeline
- Renamed `email-queue` collection to `emails-queue`
- Feedback schema: renamed `like`/`dislike` fields to `positive`/`negative`
- Feedback review prompt logic now checks total positive feedback length (50+ chars)
- Renamed `GET /app` route to `GET /brand` (completes app→brand migration)

### Removed
- Monolithic `libraries/email.js` — replaced by modular `libraries/email/` directory

# [5.0.148] - 2026-03-14
### Added
- Semantic email sender system — pass `sender: 'orders'` to `Email.send()` to auto-resolve from address, display name, and SendGrid ASM group
- 7 sender categories: `orders`, `hello`, `account`, `marketing`, `security`, `newsletter`, `internal`
- 7 dedicated SendGrid ASM groups for granular unsubscribe control
- 4 new email tests for sender resolution, override precedence, and fallback behavior

### Changed
- Migrated all email call sites from `group:` to `sender:` parameter
- `sendOrderEmail()` now accepts optional `sender` parameter (defaults to `'orders'`)
- `replyTo` now defaults to the resolved from address instead of brand default

# [5.0.147] - 2026-03-14
### Added
- 24-hour cancellation guard on `POST /payments/cancel` — blocks cancellations for subscriptions younger than 24 hours

# [5.0.146] - 2026-03-13
### Added
- Promo discount support in payment analytics — `resolveActualValue()` computes effective price accounting for trials ($0) and percentage discounts
- Promo discount details (code, percent, savings, totalToday) in new-subscription order confirmation emails

### Changed
- `trackPayment()` and `resolvePaymentEvent()` now accept `order` parameter to access discount data

# [5.0.144] - 2026-03-13
### Added
- `User.resolveSubscription()` static method that derives calculated subscription fields (plan, active, trialing, cancelling) from raw user data

# [5.0.143] - 2026-03-13
### Changed
- `sendOrderEmail()` now accepts a `copy` parameter to control whether admin receives a copy (defaults to `true` for backward compat)
- Abandoned cart reminder emails no longer send admin copies (`copy: false`) to reduce inbox noise

# [5.0.140] - 2026-03-12
### Fixed
- Chargebee meta_data backfill not including `orderId`, causing `getOrderId()` to fail on future webhooks
- `orderId` resolution now falls back to `pass_thru_content` orderId when `getOrderId()` returns null

### Changed
- `setMetaData()` API simplified to accept `(resource, meta)` instead of individual params, writing the full meta object to both subscription and customer

# [5.0.139] - 2026-03-12
### Fixed
- Chargebee hosted page checkout failing to resolve UID from webhooks because `subscription[meta_data]` is not supported by Chargebee's hosted page API
- Webhook pipeline now falls back to resolving UID from hosted page `pass_thru_content` when meta_data is missing

### Added
- `resolveUidFromHostedPage()` in Chargebee library to search recent hosted pages by subscription ID and extract UID from `pass_thru_content`
- `setMetaData()` in Chargebee library to backfill meta_data on subscriptions and customers after first UID resolution
- Automatic meta_data backfill on subscription + customer after resolving UID from pass_thru_content, so future webhooks resolve directly

### Changed
- Chargebee intent now uses `pass_thru_content` instead of `subscription.meta_data` to carry UID/orderId through checkout

# [5.0.132] - 2026-03-13
### Fixed
- Abandoned cart cron crashing with `FAILED_PRECONDITION` due to missing `payments-carts` composite index (status + nextReminderAt)
- Abandoned cart email subject and template using raw `productId` instead of resolved `productName` and `brandName`

### Changed
- Index sync (`npx bm setup`) now auto-merges local and live indexes instead of prompting to choose one direction
- Added `payments-carts` composite index to `required-indexes.js`

# [5.0.131] - 2026-03-11
### Changed
- Analytics config restructured: consolidated `googleAnalytics`, `meta`, and `tiktok` under unified `analytics.providers` namespace with `google`, `meta`, and `tiktok` keys
- Google Analytics secret moved from config (`googleAnalytics.secret`) to env var (`GOOGLE_ANALYTICS_SECRET`)
- Meta pixel ID read from `analytics.providers.meta.id` instead of `meta.pixelId`
- TikTok pixel code read from `analytics.providers.tiktok.id` instead of `tiktok.pixelCode`
- Flattened `owner` field from `{ uid: string }` to plain UID string in feedback docs, notifications, and `getDocumentWithOwnerUser()` default path
- Moved `created` timestamp inside `metadata` object in feedback documents
- Added `GOOGLE_ANALYTICS_SECRET`, `META_ACCESS_TOKEN`, `TIKTOK_ACCESS_TOKEN` to `.env` template
- Bumped version to 5.0.131

# [5.0.129] - 2026-03-11
### Added
- Usage proxy system: `setUser()` to bill usage to a different user, `addMirror()`/`setMirrors()` to write usage to additional Firestore docs in parallel
- Admin post route image rewriting: `extractImages()` now returns a URL map and rewrites markdown body to use `@post/` prefix for uploaded images
- `metadata` object on user schema with `created` and `updated` timestamps
- Firestore security rules: added `metadata` to server-only write fields
- Test for admin post creation route
- CLAUDE.md and README.md documentation for usage proxy and admin post route

### Changed
- User schema: moved `activity.lastActivity` to `metadata.updated` and `activity.created` to `metadata.created`
- `before-signin` event handler writes to `metadata.updated` instead of `activity.lastActivity`
- Admin user sync route writes to `metadata.created`/`metadata.updated` instead of `activity.created`/`activity.lastActivity`
- `Usage.update()` refactored to execute primary + mirror writes in parallel via `Promise.all()`
- Bumped version to 5.0.129

# [5.0.123] - 2026-03-10
### Added
- Dispute alert system: `POST /payments/dispute-alert` endpoint with Chargeblast processor for ingesting payment dispute webhooks
- Firestore trigger (`payments-disputes/{alertId}`) that matches disputes to Stripe invoices by date/amount/card, auto-refunds, and cancels subscriptions
- Discount code system: `GET /payments/discount` validation endpoint and `discount-codes.js` library (FLASH20, SAVE10, WELCOME15)
- Discount code integration in payment intent flow — auto-creates/reuses Stripe and Chargebee coupons with deterministic IDs
- Meta Conversions API and TikTok Events API tracking alongside existing GA4 in payment analytics
- Subscription renewal tracking as payment events (fires on `invoice.payment_succeeded` / `PAYMENT.SALE.COMPLETED` even without a state transition)
- `attribution`, `discount`, and `supplemental` fields on payment intent schema for checkout context tracking
- Intent data (attribution, discount, supplemental) propagated to order objects during webhook on-write
- `meta.pixelId` and `tiktok.pixelCode` fields in config template
- Journey test accounts for discount and attribution flows
- Tests for discount validation and dispute alert endpoints

### Changed
- Renamed config key `google_analytics` → `googleAnalytics`
- Payment analytics rewritten with independent per-platform fire functions (`fireGA4`, `fireMeta`, `fireTikTok`)
- Test runner module resolution now tries normal resolution first before falling back to search paths
- reCAPTCHA marketing contact test skipped when `TEST_EXTENDED_MODE` is not set

# [5.0.122] - 2026-03-09
### Added
- Abandoned cart reminder system: sends escalating emails at 15min, 3h, 24h, 48h, 72h to users who visit checkout but don't complete payment
- `payments-carts/{uid}` Firestore collection with security rules (client-side write, server-side completion)
- `bm_cronFrequent` Cloud Function running every 10 minutes for sub-daily cron jobs
- Shared cron runner (`cron/runner.js`) consolidating daily and frequent cron orchestrators
- `main/order/refunded` and `main/order/abandoned-cart` email templates
- Firestore rules test for `payments-carts` (12 test cases)

### Changed
- Migrated v1 email templates to v2 SendGrid template IDs
- `cron/daily.js` and `cron/frequent.js` now delegate to shared `cron/runner.js`
- Payment analytics tracking now fires independently of transitions

# [5.0.120] - 2026-03-09
### Added
- reCAPTCHA verification on `POST /payments/intent` route (reads `verification.g-recaptcha-response` from request body)
- Shared `libraries/recaptcha.js` module for reCAPTCHA token verification (replaces duplicate helpers)
- `verification` field in `payments/intent` schema to accept the reCAPTCHA token object

### Security
- reCAPTCHA failure responses now return generic "Request could not be verified" (403) instead of revealing the verification mechanism
- reCAPTCHA verification runs in all environments except automated tests (`isTesting()`)

### Changed
- Marketing contact routes (`POST /marketing/contact`, `bm_api add-marketing-contact`) now use shared `recaptcha.verify()` instead of inline helpers
- Marketing reCAPTCHA checks skip during automated tests (consistent with payment intent)

# [5.0.119] - 2026-03-07
### Added
- `POST /marketing/email-preferences` route for unsubscribe/resubscribe via SendGrid ASM suppression groups
- HMAC signature verification (`UNSUBSCRIBE_HMAC_KEY`) on unsubscribe links to prevent forged requests
- HMAC signature generation in email library when building unsubscribe URLs
- `UNSUBSCRIBE_HMAC_KEY` environment variable in template `.env`
- Test suite for email-preferences endpoint (10 tests covering sig verification, validation, auth)

### Changed
- Unsubscribe URL in emails no longer includes `appName` and `appUrl` params (replaced by HMAC sig)

# [5.0.118] - 2026-03-06
### Added
- Chargebee payment processor with full pipeline support (intent, webhook, cancel, refund, portal).
- Chargebee shared library (`payment/processors/chargebee.js`) with raw HTTP API wrapper, unified subscription/one-time transformers, and both Items model (new) and Plans model (legacy) product resolution.
- Chargebee webhook processor supporting subscription lifecycle events (`subscription_created`, `subscription_cancelled`, `subscription_renewed`, `payment_failed`, `payment_refunded`, etc.) and one-time invoice events.
- Chargebee intent processor for hosted page checkout (subscriptions and one-time purchases) with deterministic item price IDs (`{itemId}-{frequency}`).
- Chargebee cancel processor with immediate cancellation during trials and end-of-term cancellation otherwise.
- Chargebee refund processor with 7-day full/prorated refund logic (matching Stripe/PayPal behavior).
- Chargebee portal processor for self-service subscription management via Chargebee Portal Sessions.
- Backwards compatibility for legacy Chargebee subscriptions: reads `cf_clientorderid`/`cf_uid` custom fields alongside new `meta_data` JSON format.
- Chargebee test suite: `to-unified-subscription`, `to-unified-one-time`, and `parse-webhook` group tests with fixtures covering all status mappings, product resolution (Items + legacy Plans), and edge cases.
- Chargebee customer name extraction from `shipping_address`/`billing_address` in webhook on-write pipeline.
- `chargebee` config keys in product templates (`itemId`, `legacyPlanIds`).

### Changed
- `CHARGEBEE_SITE` environment variable is now set from config in Manager init (matching PayPal pattern), so the Chargebee library doesn't need a Manager reference.

# [5.0.111] - 2026-03-05
### Changed
- PayPal client ID is now read from `backend-manager-config.json` (`payment.processors.paypal.clientId`) instead of requiring a `PAYPAL_CLIENT_ID` environment variable.
- PayPal auth now auto-detects sandbox vs live environment by trying both endpoints in parallel on first auth, with live taking priority.

# [5.0.109] - 2026-03-04
### Added
- Immediate trial cancellation: cancelling during a free trial now terminates the subscription instantly instead of scheduling cancel at period end, preventing free premium access for the remainder of the trial.
- Intent status tracking: `payments-intents/{orderId}` is now updated with `status: completed/failed` and completion timestamp after webhook processing.
- `journey-payments-trial-cancel` test suite covering the full trial → cancel → immediate cancellation flow.

### Changed
- Stripe and test cancel processors now detect trialing state and dispatch immediate cancel (`customer.subscription.deleted`) vs period-end cancel (`customer.subscription.updated`).

# [5.0.106] - 2026-03-04
### Added
- `GET /payments/trial-eligibility`: returns whether the authenticated user is eligible for a free trial (checks for any previous subscription orders in `payments-orders`).

### Fixed
- Payment frequency mapping now supports `daily` and `weekly` in addition to `monthly` and `annually` across Stripe (`resolvePriceId`), PayPal (`resolvePlanId`), and test processor (`createSubscriptionIntent`). Previously, these frequencies silently fell back to `monthly`.
- Updated docs (CLAUDE.md, README.md) to list all four supported frequency values.

# [5.0.104] - 2026-03-02
### Added
- `POST /payments/cancel`: cancels subscription at period end via processor abstraction (Stripe sets `cancel_at_period_end=true`; test processor writes webhook directly into the Firestore pipeline).
- `POST /payments/portal`: creates Stripe Billing Portal session with cancellation disabled (users must use the cancel endpoint).
- Payment transition pipeline: `transitions/index.js` detects all subscription state changes (new-subscription, payment-failed, payment-recovered, cancellation-requested, subscription-cancelled, plan-changed) and one-time transitions (purchase-completed, purchase-failed). Handlers fire-and-forget, send transactional emails.
- Payment analytics: `analytics.js` tracks GA4 payment events for all transitions (non-blocking, skipped in tests).
- Shared payment processor libraries: `payment/processors/stripe.js` (toUnifiedSubscription, toUnifiedOneTime, resolveCustomer, resolvePriceId, fetchResource), `payment/processors/paypal.js`, `payment/processors/test.js`, `payment/order-id.js`.
- `Email` library (`libraries/email.js`): shared transactional email via SendGrid, used by transition handlers and admin routes.
- `infer-contact.js` library: infers user name from payment processor data, auto-fills on first purchase.
- `routes/user/data-request/` (get/post/delete): GDPR data request endpoints.
- `cron/daily/data-requests.js`: daily cron to process pending GDPR data requests.
- CLI commands: `auth` (get/list/delete/set-claims), `firestore` (get/set/query/delete), `firebase-init`, `emulator` (renamed from `emulators`).
- `setup-tests/firestore-indexes-required.js`: validates required Firestore indexes exist before tests run.
- Comprehensive payment test suite: journey tests for one-time purchase, one-time failure, payment failure, plan change, cancel endpoint; route validation tests for cancel and portal; unit tests for `toUnifiedOneTime()`, `stripe-parse-webhook`, `infer-contact`, `email`; real Stripe CLI fixtures.
- Dedicated isolated test accounts for every mutating payment test (no shared state between tests).

### Changed
- `admin/email/post.js`, `general/email/post.js`: refactored to delegate to shared Email library (~400 lines removed from each).
- `marketing/contact/post.js`, `api/general/add-marketing-contact.js`: delegate to infer-contact + marketing library.
- `user/signup/post.js`: rewritten with new middleware pattern.
- `auth/on-create.js`: simplified, inline logic moved to middleware.
- `api/admin/send-email.js`: removed `ensureUnique` and SendGrid contact name lookup (handled by Email library).
- All admin routes: middleware pattern cleanup.
- `config.payment.products` now supports `type: 'one-time'` products with `prices.once` key.
- Test runner: improved discovery, filtering, and output formatting.

### Removed
- `src/manager/libraries/stripe.js`, `src/manager/libraries/test.js`: replaced by `payment/processors/` shared libs.
- `REFACTOR-BEM-API.md`, `REFACTOR-MIDDLEWARE.md`, `REFACTOR-PAYMENT.md`: work completed, files deleted.
- `bin/bem`: replaced by `bin/backend-manager`.

# [5.0.84] - 2026-02-19
### BREAKING
- Moved `config.products` to `config.payment.products`. All product lookups now use `config.payment.products`.
- Renamed `subscription.trial.activated` to `subscription.trial.claimed` across the entire subscription schema, API responses, analytics properties, and tests.
- Renamed analytics user property `plan_id` to `subscription_id` and `plan_trial_activated` to `subscription_trial_claimed`.
- Removed `Manager.getApp()` method (previously fetched from ITW Creative Works endpoint).
- Removed `Manager.SubscriptionResolver()` factory method.
- Removed deprecated `RUNTIME_CONFIG` .env loading from config merge.
- Test accounts now use `subscription.*` instead of `plan.*`.

### Added
- Stripe payment integration with shared library (`src/manager/libraries/stripe.js`) and `toUnified()` transformer that maps Stripe subscription states to the unified subscription schema.
- Test payment processor library that delegates to Stripe's transformer with `processor: 'test'`.
- Payment webhook route (`POST /payments/webhook`) with processor-specific handlers for Stripe (with signature verification) and test, including idempotent event storage in `payments-webhooks` Firestore collection.
- Payment intent route (`POST /payments/intent`) for creating checkout sessions with processor-specific handlers.
- Firestore trigger (`bm_paymentsWebhookOnWrite`) that processes stored webhook events and updates user subscription documents.
- Payment schemas for webhook and intent validation.
- `payment.processors` config section for Stripe, PayPal, Chargebee, and Coinbase configuration.
- `npx bm stripe` CLI command for standalone Stripe webhook forwarding.
- Auto-start Stripe CLI webhook forwarding with `npx bm emulator` (gracefully skips when prerequisites are missing).
- `Manager.version` property exposing the BEM package version.
- Journey test accounts for payment lifecycle testing (upgrade, cancel, suspend, trial).
- Stripe fixture data for subscription states (active, trialing, canceled).
- Tests for `stripe-to-unified` transformer, payment webhook route, and payment intent route.
- Test cleanup for payment-related Firestore collections (`payments-subscriptions`, `payments-webhooks`, `payments-intents`).

### Changed
- Cron schedule from `every 24 hours` to `0 0 * * *` (explicit midnight UTC).
- Test runner now passes full config object (with convenience aliases) for payment processor access.
- Unauthenticated usage tests now use relative assertions instead of absolute values.

### Removed
- Removed `PAYPAL_CLIENT_ID` and `CHARGEBEE_SITE` from `.env` template (now configured via `payment.processors` in config).

# [5.0.39] - 2025-01-12
### Added
- New test infrastructure with Firebase emulator support for reliable, isolated testing.
- Test runner with emulator auto-detection and startup.
- Test types: standalone, suite (sequential with shared state), group (independent).
- Built-in test accounts with SSOT configuration (basic, admin, premium-active, etc.).
- Firestore security rules testing support.
- HTTP client with auth helpers (`http.as('admin').command()`).
- Rich assertion library (`isSuccess`, `isError`, `hasProperty`, etc.).
- New `bm emulator` command for standalone emulator management.
- Enhanced `bm test` with path filtering and parallel test support.

### Changed
- Reorganized test files to `test/functions/` with `admin/`, `user/`, `general/` categories.
- Standardized auth test naming to `unauthenticated-rejected`.
- Auth rejection tests moved to end of test files (before cleanup).

### Fixed
- Changed unauthenticated API error from 500 to 401 with proper "Authentication required" message.

### Removed
- Removed legacy test files (moved to `test/_legacy/`).
- Removed deprecated CLI files and templates.
- Consolidated test account creation from API endpoint to test runner.

# [5.0.31] - 2025-01-17
### Changed
- Refactored CLI to modular command architecture with individual command classes and test files for better maintainability.
- Migrated from deprecated `.runtimeconfig.json` to `.env` file with `RUNTIME_CONFIG` environment variable.

### Removed
- Removed deprecated Firebase config commands (`config:get`, `config:set`, `config:unset`).

### Fixed
- Fixed `install:local` command to save to dependencies instead of devDependencies.
- Fixed reserved word conflicts with `package` parameter.
- Fixed template file path resolution in setup tests.

# [5.0.0] - 2025-07-10
### ⚠️ BREAKING
- Node.js version requirement is now `22`.
- `Manager.init()` no longer wraps the initializeApp() in `try/catch` block.
- `Settings()` API tries to look for a method-specific file first (e.g., `name/get.js`, `name/post.js`, etc.) before falling back to `name/index.js`. This allows for more modular and organized code structure. Also, `name.js` is no longer valid, we now look for `name/index.js` this is to make it consistent with the `Middleware()` API.
- `Middleware()` API now tries to load method-specific files (e.g., `name/get.js`, `name/post.js`, etc.) before falling back to `name/index.js`.
- `ai.request()` no longer accepts `options.message.images`. Use `options.message.attachments` instead.

# [4.2.22] - 2024-12-19
### Changed
- `Manager.install()` now automatically binds the fn with the proper `this` context (this may be breaking).

# [4.1.0] - 2024-12-19
### Changed
- Attach `schema` to `bm-properties` response header.
- `assistant.request.url` is now properly set for all environments (development, production, etc) and works whether called from custom domain or Firebase default function domain.

## [4.0.0] - 2024-05-08
### ⚠️ BREAKING
- Require Node.js version `18` or higher.
- Updated `firebase-functions` to `6.0.1` (now need to require `firebase-functions/v1` to use v1 functions or `firebase-functions/v2` to use v2 functions).

## [3.2.109] - 2024-05-08
### Changed
- Replaced all `methods` references with `routes`. This should be changed in your code as well.

## [3.2.32] - 2024-01-30
### Changed
- Modified `.assistant().errorify()` to have defaults of `log`, `sentry`, and `send` to `false` if not specified to prevent accidental logging and premature sending of errors.

## [3.2.30] - 2024-01-30
### Changed
- Modified `.assistant()` token/key check to use `options.apiKey || data.apiKey`

## [3.2.0] - 2024-01-19
### Added
- Added `.settings()` API. Put your settings in `./schemas/*.js` and access them with `assistant.settings.*`.

## [3.1.0] - 2023-12-19
### Added
- Added `.analytics()` API GA4 support.

#### New Analytics Format
```js
  analytics.send({
    name: 'tutorial_begin',
    params: {
      tutorial_id: 'tutorial_1',
      tutorial_name: 'the_beginning',
      tutorial_step: 1,
    },
  });
```
- Added `.usage()` API to track user usage.
- Added `.middleware()` API to help setup http functions.
- Added `.respond()` function to `assistant.js` to help with http responses.

## [3.0.0] - 2023-09-05
### ⚠️ BREAKING
- Updated `firebase-admin` from `9.12.0` --> `11.10.1`
- Updated `firebase-functions` from `3.24.1` --> `4.4.1`
- This project now requires `firebase-tools` from `10.9.2` --> `12.5.2`

- Updated required Node.js version from `12` --> `16`

- Updated `@google-cloud/storage` from `5.20.5` --> `7.0.1`
- Updated `fs-jetpack` from `4.3.1` --> `5.1.0`
- Updated `uuid` from `8.3.2` --> `9.0.0`

- Removed `backend-assistant` dependency and moved to custom library within this module at `./src/manager/helpers/assistant.js`
- Replaced `require('firebase-functions/lib/logger/compat')` with the updated `require('firebase-functions/logger/compat')`
- Changed default for `options.setupFunctionsLegacy` from `true` --> `false`
- `.analytics()` is broken due to GA4 updates and should not be used until the next feature release
- Updated geolocation and client data retrieval to new format:
#### New Way
```js
  const assistant = new Assistant();

  // Get geolocation data
  assistant.request.geolocation.ip;
  assistant.request.geolocation.continent;
  assistant.request.geolocation.country;
  assistant.request.geolocation.region;
  assistant.request.geolocation.city;
  assistant.request.geolocation.latitude;
  assistant.request.geolocation.longitude;

  // Get Client data
  assistant.request.client.userAgent;
  assistant.request.client.language;
  assistant.request.client.platform;
  assistant.request.client.mobile;
```

#### Old Way
```js
  const assistant = new Assistant();

  // Get geolocation data
  assistant.request.ip;
  assistant.request.continent;
  assistant.request.country;
  assistant.request.region;
  assistant.request.city;
  assistant.request.latitude;
  assistant.request.longitude;

  // Get Client data
  assistant.request.userAgent;
  assistant.request.language;
  assistant.request.platform;
  assistant.request.mobile;
```

## [2.6.0] - 2023-09-05
### Added
- Identity Platform auth/before-create.js
- Identity Platform auth/before-signin.js
- Disable these by passing `options.setupFunctionsIdentity: false`
