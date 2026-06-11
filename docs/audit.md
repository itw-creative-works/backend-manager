# Audit Workflow

Full-project audit for BEM — runs against a CONSUMER backend or the FRAMEWORK repo itself (scope auto-detected). Invoked via the `omega:bem` skill (`/omega:bem audit`) or any "audit this backend/project" request.

Every check has a stable ID, a severity, and a scope. Findings are reported as `ID @ file:line`, fixed one at a time, then re-verified. The tables below do NOT restate the rules — each check links to the doc that owns the rule and the fix.

## Protocol

1. **Detect scope** — read `package.json` (consumer: `functions/package.json`): `name` is `backend-manager` → **framework audit** (U + BEM + F checks); `backend-manager` in (dev)dependencies → **consumer audit** (U + BEM checks).
2. **Run the catalog** — every check matching the scope. Search with Grep/Glob/Read over `functions/` (`routes/`, `schemas/`, `hooks/`, `index.js`), `test/`, and config files; ALWAYS exclude `node_modules/`, `dist/`, `_legacy/`, `_backup/`. Record each finding as `ID @ file:line` + a one-line description.
3. **Persist the report** — write the findings list to `functions/.temp/audit/claude-audit.md` (BEM's `functions/`-local convention, like its logs) so a long fix loop survives session breaks. Summarize counts by severity in chat.
4. **Fix loop** — TodoWrite per finding, highest severity first, ONE at a time: mark in-progress → root cause → fix → verify → complete. Ask before structural or destructive fixes (file deletions, schema reshapes, data migrations).
5. **Re-verify** — re-run every check that produced findings until clean; finish with `npx mgr test` from `functions/` (must be green — it auto-starts its own emulator if needed).
6. **Doc parity** — if fixes changed behavior, update README / CLAUDE.md / `docs/<topic>.md` / CHANGELOG in the same change set.

Severity: **CRIT** security or broken functionality · **HIGH** hard-rule violation · **MED** convention drift · **LOW** optional improvement.
Scope: **C** consumer · **F** framework repo · **B** both.

## Universal checks (U-xx)

Mirrored across all four OMEGA frameworks (UJM / BEM / BXM / EM) — same ID means the same check everywhere.

| ID | Sev | Scope | Check |
|----|-----|-------|-------|
| U-01 | HIGH | B | Every feature has tests at EVERY surface it exposes — handler suites + `http.as(...)` route round-trips + rules suites; never mocked, real emulator only ([test-framework.md](test-framework.md)) |
| U-02 | HIGH | B | Test hygiene — side-effect tests use dedicated `journey-*` accounts; real-external-API tests gated behind `TEST_EXTENDED_MODE` in-source (not mocked); files export `{ description, type, tests }` (no raw Mocha); no trailing cleanup steps ([test-framework.md](test-framework.md)) |
| U-03 | CRIT | B | Sanitization — middleware is trim-only by default; HTML strip via opt-in `{ sanitize: true }`; every HTML-insertion site calls `utilities.sanitize()` ([sanitization.md](sanitization.md)) |
| U-04 | HIGH | B | Firebase ownership — server code uses `firebase-admin` via Manager (correct here); NO client `firebase` SDK in functions code; consuming frontends go through web-manager ([CLAUDE.md](../CLAUDE.md) §Dependency Resolution) |
| U-05 | HIGH | C | No BEM transitive deps installed directly in `functions/package.json` — use `Manager.require(name)` ([CLAUDE.md](../CLAUDE.md) §Dependency Resolution) |
| U-06 | HIGH | B | Env behavior gated on the INTENTIONAL check — `isProduction()` or `isDevelopment() \|\| isTesting()`, never `!isDevelopment()`; always `Manager.getApiUrl()`, never the cached `Manager.project.apiUrl` ([environment-detection.md](environment-detection.md)) |
| U-07 | HIGH | B | Config canon — `backend-manager-config.json` matches the documented shape; canonical cross-framework blocks (`brand`, payment products, …) not reinvented ([architecture.md](architecture.md), [payment-system.md](payment-system.md)) |
| U-08 | CRIT | B | No private credentials committed — `service-account.json`, `.env` secrets, API keys (Stripe `sk_`, SendGrid `SG.`, …); `.gitignore` covers them. (The Firebase WEB `apiKey` is public by design — do NOT flag it.) |
| U-09 | HIGH | B | Source discipline — no live code referencing `_legacy/` / `_backup/`; framework edits in `src/` (never `dist/`) ([common-mistakes.md](common-mistakes.md)) |
| U-10 | MED | B | Doc parity — README / CLAUDE.md / `docs/` / CHANGELOG match shipped behavior; CLAUDE.md < 250 lines; the docs index lists every `docs/*.md`; no stale names for renamed commands/patterns |
| U-11 | MED | B | SSOT/DRY — no duplicated constants/config/logic; one authoritative home per value, imported everywhere else |
| U-12 | MED | B | JS conventions — file structure, JSDoc, short-circuit returns, leading logical operators, `fs-jetpack`, one `module.exports` per file ([code-patterns.md](code-patterns.md) + global `js:patterns` skill) |
| U-13 | MED | B | Dead code & stale patterns — no orphaned files nothing imports; no leftovers of migrated-away formats (constructor routes, tiered schemas, `Manager.config.*` reads — [migration.md](migration.md)); inventory TODO/FIXME (report only) |
| U-14 | LOW | B | Dependency health — review `npm outdated` / `npm audit` (in `functions/`); apply fixes via the `general:update-packages` workflow (includes supply-chain checks) |

## BEM-specific checks

| ID | Sev | Scope | Check |
|----|-----|-------|-------|
| BEM-01 | HIGH | B | Every custom route has a name-matched schema; handlers are context-object exports (`async ({ Manager, assistant, … }) => {}`) — no legacy constructor routes ([routes.md](routes.md), [schemas.md](schemas.md)) |
| BEM-02 | HIGH | B | Schema field rules — never `required: true` + `default` together (required is checked BEFORE defaults; use `min: 1` for path-extracted IDs); flat schema with in-function plan branching, no tier arrays ([schemas.md](schemas.md)) |
| BEM-03 | HIGH | B | Route handlers — ownership checks on PUT/DELETE; plural-noun route names; `assistant.respond()` only (never `res.send()`) ([routes.md](routes.md), [common-operations.md](common-operations.md)) |
| BEM-04 | HIGH | C | Wiring — every route exported in `functions/index.js`; `firebase.json` rewrites use bracket syntax, ordered most-specific-first ([routes.md](routes.md)) |
| BEM-05 | HIGH | B | Firestore canon — NO subcollections; path-string `.doc('users/abc')`; batched collection reads (~500, cursor pagination); timestamps under `metadata.{created,updated}`; mirror-the-doc responses; delete-don't-redact ([firestore.md](firestore.md)) |
| BEM-06 | HIGH | B | Usage — never read/write `{doc}.usage.*` manually, always the `usage` helper; expensive/abusable routes carry usage validation or rate limiting ([usage-rate-limiting.md](usage-rate-limiting.md)) |
| BEM-07 | MED | B | Composite indexes — every compound query (`where` + `orderBy`, multiple `where`s) is registered in the required-indexes SSOT ([CLAUDE.md](../CLAUDE.md) §File Conventions) |
| BEM-08 | HIGH | B | Auth gates — routes resolve the caller via `assistant`/`user` before acting; admin-only routes verify admin status ([common-operations.md](common-operations.md), [routes.md](routes.md)) |
| BEM-09 | HIGH | B | Rules coverage — `firestore.rules` changes ship a rules suite (`rules.asAccount` / `expectSuccess` / `expectFailure`) ([test-framework.md](test-framework.md)) |

## Framework-repo checks (F-xx)

Only when auditing the BEM repo itself. Mirrored across the four frameworks.

| ID | Sev | Check |
|----|-----|-------|
| F-01 | MED | Sister parity — mirrored sections (config shapes, test contract, CLAUDE.md skeleton, shared env/test conventions) in sync with UJM / BXM / EM; deviations are deliberate and documented |
| F-02 | HIGH | Consumer-shipped defaults in sync — what `npx mgr setup` scaffolds matches current conventions and docs |
| F-03 | MED | Docs completeness — every `docs/*.md` indexed in CLAUDE.md; every subsystem has a doc; no "(planned)" links for things that have shipped |
| F-04 | HIGH | `npx mgr test mgr:` green before treating the audit as complete |

## See also

- [schemas.md](schemas.md) — the required-vs-default footgun behind BEM-02
- [firestore.md](firestore.md) — the data canon behind BEM-05
- [migration.md](migration.md) — the legacy formats U-13 hunts for
- [test-framework.md](test-framework.md) — the surfaces behind U-01 / U-02 / BEM-09
