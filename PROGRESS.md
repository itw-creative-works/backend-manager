# Project Progress Tracker
> Agents and maintainers should update this file regularly to reflect the current state of the project.

## 🎯 Current Focus
* **Goal:** Fix newsletter pipeline end-to-end — cron, generation, asset hosting, delivery
* **Current Phase:** Phase 12 (campaign pipeline hardening) shipped as v5.11.4 (npm + GitHub release) — consumer deploys next.
* **Priority:** High
* **Last Updated:** 2026-07-02 1:45 AM PDT
* **Notes:** Full-system review found + fixed: (1) `sources` ReferenceError in buildLinkedArticle — article publishing silently broken in prod since 5.11.0; (2) one-off generator campaigns never finalized (re-fired every 10 min); (3) no claim/lease → double-send risk (now transactional pending→processing + 30-min stale reclaim); (4) catch-up bursts on stalled recurring (now getNextFutureOccurrence); (5) generator empty-run retry cap (36); (6) newsletter generate() test-mode gate (default test runs were firing the REAL pipeline in background); (7) isURL http(s)-only. bm_cronFrequent → 512MB/540s. Cron suite 7→13 tests, all green; extended e2e published a real article + CTA verified; CDN rule live (302→200). CHANGELOG [Unreleased] + docs updated. NOT yet shipped/published.

## 📌 Active Task List
* [x] One-off: CDP doc rewrite for the per-session isolated browser (2026-07-01)
  * [x] `docs/cdp-debugging.md` rewritten (mirrored UJM/BEM/BXM/EM/WM): sessions auto-launch their own private Chrome via the `chrome-devtools` MCP — no launch command/ports/shared profile; UJM dev URL rule: `https://localhost:4000`, NEVER the LAN IP; CLAUDE.md live-test line updated; CHANGELOG [Unreleased] added (uncommitted — ship with next release)
  * [x] OMEGA mirror mandate: Doc-update parity now documents the mirrored structure (canonical skeletons: omega:main mirror-spec); maintainer mirror note added to src/defaults/CLAUDE.md
* [ ] Phase 11: Fix newsletter generator never firing in frequent cron
  * [x] Task 11.1: Diagnose — frequent cron skips generator campaigns, `bm_cronDaily` not running (7+ days)
  * [x] Task 11.2: Fix stale `fetchSources` export in `newsletter.js` (ReferenceError on require)
  * [x] Task 11.3: Replace generator skip with inline generation logic in `marketing-campaigns.js`
  * [x] Task 11.4: Write `test/email/campaign-cron-pipeline.js` (7 tests — oneoff, recurring, generator paths)
  * [x] Task 11.5: Verify all 7 tests pass on somiibo-backend
  * [x] Task 11.6: Beehiiv upload: default to `confirmed` (published) in production, force `draft` in `isTesting()`
  * [x] Task 11.7: Article CTA only injected when article is actually published (no dead links in testing)
  * [x] Task 11.8: Remove redundant `marketing-newsletter-generate.js` from daily cron (SSOT: frequent cron is the sole handler)
  * [x] Task 11.9: Update all stale docs/comments referencing old daily pre-generation pipeline
  * [x] Task 11.10: SSOT/DRY audit — no duplication, all references updated
  * [x] Task 11.11: Publish BEM v5.10.0
  * [x] Task 11.12: Deploy somiibo/optiic/studymonkey — hit config format + GitHub race issues
  * [x] Task 11.13: Fix config format — `newsletter.content` must be array (matches BEM template)
  * [x] Task 11.14: Per-brand branches for newsletter-assets repo (zero contention on concurrent uploads)
  * [x] Task 11.15: Migrate all 11 brand folders to brand-specific branches, clean `main` to viewer hub
  * [x] Task 11.16: Fix newsletter-generate test to handle array content format
  * [x] Task 11.17: E2E test — full newsletter upload to `somiibo` branch verified (images + HTML + fallback email)
  * [x] Task 11.18: Rebuild all 11 brand branches as clean orphans (only own content, no cross-brand bloat)
  * [x] Task 11.19: Update newsletter-assets README with architecture diagram + viewer link
  * [x] Task 11.20: Per-brand branches — `content/` folder structure, orphan main, orphan brand branches (1 commit each)
  * [x] Task 11.21: Dynamic branch count badge + eye preview badge on README
  * [x] Task 11.22: Fix newsletter-generate test for array content format
  * [x] Task 11.23: New brand branches created as empty orphans (zero files, zero history)
  * [x] Task 11.24: E2E verified — images to `somiibo` branch `content/` dir, CTA omitted (test mode), fallback email fires
  * [x] Task 11.25: Publish BEM v5.10.1 (per-brand branches + content/ path)
  * [x] Task 11.26: Publish BEM v5.10.2 (single-commit upload, CDN URLs, fallback email improvements)
  * [x] Task 11.27: Newsletter report email — always sent (not just on failure), preview button, sources section
  * [x] Task 11.28: Article source passed to admin/post via publishArticle()
  * [x] Task 11.29: Unified source resolution — resolveSources() in source-resolver.js, shared by blog + newsletter (random picks, type-hierarchy fallback, Firestore + session dedup, no $brand fallback ever)
  * [x] Task 11.30: Newsletter sourceCount config (default 6) — replaces process-every-feed + 9-parent-sources behavior
  * [x] Task 11.31: Tests rewritten for new hierarchy (31 passing) + extended e2e verified (resolver picks 6/6, dedupes 9→7 parent pool)
  * [x] Task 11.32: Publish BEM v5.11.0
  * [x] Task 11.33: Set up Cloudflare redirect rule for cdn.itwcreativeworks.com/newsletters/* (verified: cdn URLs 302 → raw.githubusercontent → 200)
  * [ ] Task 11.34: Update + deploy all consumer backends with new BEM + array config format
* [ ] Phase 12: Campaign pipeline hardening (from full-system review)
  * [x] Task 12.1: Fix `sources` ReferenceError in buildLinkedArticle — article publishing silently broken in prod since 5.11.0 (swallowed by try/catch); pass filteredSources in
  * [x] Task 12.2: Finalize one-off generator campaigns (were re-firing every 10 min forever); unknown type/generator → status 'failed' + error field
  * [x] Task 12.3: Claim/lease lifecycle — transactional pending→processing claim, stale-lease reclaim after 30 min, no double-sends from overlapping/timed-out runs
  * [x] Task 12.4: getNextFutureOccurrence() — recurring advance skips missed occurrences (no catch-up bursts)
  * [x] Task 12.5: Generator empty-run retry cap (generatorAttempts, 36 ≈ 6h) — recurring skips occurrence, one-off fails
  * [x] Task 12.6: Test-mode gate on newsletter generate() (isTesting && !TEST_EXTENDED_MODE → null) — default test runs no longer fire the real pipeline in the background
  * [x] Task 12.7: isURL() http(s)-only — colon-prefixed text seeds ("AI: ...") no longer misclassified as URLs and lost
  * [x] Task 12.8: bm_cronFrequent 512MB/540s (was 256MB/300s); strip article payload from history-doc settings
  * [x] Task 12.9: Tests — cron suite 7→13 (lease reclaim, fresh-lease no-touch, unknown type/gen, catch-up, retry cap ×2, attempts bookkeeping), pure getNextFutureOccurrence, isURL colon cases, extended-mode published-article + CTA regression asserts. All green (13 + 41 default; extended e2e published real article)
  * [x] Task 12.10: Docs — marketing-campaigns.md (lease lifecycle, statuses, retry cap, catch-up, test gating), CHANGELOG [Unreleased]
  * [x] Task 12.11: Ship + publish BEM v5.11.4 (npm + GitHub release)
  * [ ] Task 12.12: Deploy consumers with 5.11.4 (picks up article-publish fix + 512MB/540s cron runtime)
* [ ] Phase 9: Blog auto-publisher dedup + fallback fixes
  * [x] Task 9.1: Diagnose — $brand fallback ignoring user config, per-feed-only dedup, weak prompt
  * [x] Task 9.2: Add `getRecentTitles` to source-resolver.js (collects both postTitle + itemTitle)
  * [x] Task 9.3: Conditional $brand fallback in `resolveSource()` — only if in entry.sources
  * [x] Task 9.4: Source retry loop in `harvest()` — shuffle + try all sources before skipping
  * [x] Task 9.5: Strengthen topic dedup prompt (STRICT, forbid same theme/keyword combo)
  * [x] Task 9.6: Track item titles in runTitles for within-run prompt dedup
  * [x] Task 9.7: Update docs (ghostii.md — feed flow, fallback behavior, dedup levels)
  * [x] Task 9.8: Remove cross-feed title similarity check (too fragile — word-overlap heuristic)
  * [x] Task 9.9: Run tests (26 passing via `npm test -- mgr:helpers/content/blog-auto-publisher`)
  * [x] Task 9.10: Publish BEM v5.9.25 to npm + GitHub release
  * [x] Task 9.11: Add "NEVER use npx mgr from framework repo" rule to ALL four OMEGA frameworks (BEM/UJM/BXM/EM CLAUDE.md + skills)
  * [ ] Task 9.12: Deploy Daily Embers with new BEM version
* [ ] Phase 6: Setup scaffolds essential configs for fresh projects
  * [x] Task 6.1: Add `templates/firebase.json` standard template
  * [x] Task 6.2: Add `scaffoldConfigs()` + `resolveProjectId()` to setup.js (runs before config resolution)
  * [x] Task 6.3: Auto-fix `engines.node` instead of throwing
  * [x] Task 6.4: Fix `dependencies['backend-manager']` crash when BEM is in devDependencies
  * [x] Task 6.5: Verify fix on truly bare project (dailyembers-backend — 13/14 pass, only service-account expected)
  * [x] Task 6.6: Optimize — consolidate scattered scaffolding into one `[DEFAULTS]` pass with `loadFiles()` DRY extraction
  * [x] Task 6.7: Regression test on existing project (ultimate-jekyll-backend — all pass)
  * [x] Task 6.8: Update docs (CLAUDE.md, CHANGELOG.md)
  * [ ] Task 6.9: Publish new BEM version
* [ ] Phase 5: Ghostii feed-based article system
  * [x] Task 5.1: Create `feed-parser.js` (RSS 2.0, Atom 1.0, JSON Feed parser + article extractor)
  * [x] Task 5.2: Add `fast-xml-parser` dependency to BEM
  * [x] Task 5.3: Add `sourceContent` field to Ghostii backend schema (16KB)
  * [x] Task 5.4: Update Ghostii outline prompt (Step 2 only) with sourceContent for efficient spinning
  * [x] Task 5.5: Update `writeArticle()` to accept `sourceContent` and per-entry `overrides`
  * [x] Task 5.6: Upgrade `ghostii-auto-publisher.js` — `$feed:` source type, feed processing, Firestore tracking, fallback
  * [x] Task 5.7: Update config template with new source types and overrides
  * [x] Task 5.8: Write extensive test suite (4 test files: unit, integration, extended E2E)
  * [x] Task 5.9: Verify all tests pass (84 standard + 8 extended against real RSS feeds)
  * [x] Task 5.10: Create `docs/ghostii.md` deep reference, update CLAUDE.md + CHANGELOG.md
  * [x] Task 5.11: Verify all recommended feed URLs work (The Verge removed — CDN blocks programmatic access)
  * [x] Task 5.12: Write ghostii-backend tests for sourceContent (4 schema + 1 extended generation)
  * [x] Task 5.13: Ghostii sourceContent accepts URL (auto-fetches + extracts article text)
  * [x] Task 5.14: Add fact paraphrasing to outline prompt + newsletter writer
  * [x] Task 5.15: Fix Step 3 prompts — assertive link insertion + blockquote in every body section
  * [x] Task 5.16: Fix humanizer stripping links — `injectBurstiness` was breaking `[text](url)` syntax; added protect-and-restore pattern + tests
  * [x] Task 5.17: Fix 403 links treated as "working" in link verification step
  * [x] Task 5.18: Add detective-level `[LINKS]` diagnostic logging to article pipeline
  * [x] Task 5.19: Ship BEM v5.8.0 to npm
  * [x] Task 5.20: Ship Ghostii-backend v1.0.5 + deploy to Firebase
  * [ ] Task 5.17: Publish BEM with feed support
  * [ ] Task 5.12: Publish BEM with feed support
  * [ ] Task 5.13: Configure consumer project(s) with `$feed:` sources
* [x] Phase 7: Fix suspended subscription cancel dead zone
  * [x] Task 7.1: Trace user `t9AeAe7QUhNXAUYRV1vUbOU0QVV2` — identified asymmetric status gates
  * [x] Task 7.2: Update cancel gate to accept `suspended` alongside `active`
  * [x] Task 7.3: Add fallback — direct Firestore reset when processor rejects suspended cancel
  * [x] Task 7.4: Add `cancel-suspended` test account + `allows-suspended-subscription` test
  * [x] Task 7.5: All 24 payment tests passing
  * [ ] Task 7.6: Publish BEM + deploy Somiibo
* [ ] Phase 10: Fix email-queue infinite retry for orphaned entries
  * [x] Task 10.1: Diagnose — `doc.ref.delete()` only runs on success, failed entries retry forever
  * [x] Task 10.2: Add retry counter + permanent/temporary failure classification to email-queue cron
  * [ ] Task 10.3: Publish new BEM version
  * [ ] Task 10.4: Deploy ITW Creative Works to clear 22 stuck entries
* [ ] Phase 8: Fix cron runner error propagation blocking usage reset
  * [x] Task 8.1: Diagnose — `beehiivConfig` crash in newsletter generator blocks `reset-usage.js` (alphabetical order: m < r)
  * [x] Task 8.2: Remove `throw e` from `src/manager/events/cron/runner.js` — handlers now fail independently
  * [ ] Task 8.3: Publish new BEM version
  * [ ] Task 8.4: Update Chatsy to new BEM + redeploy
  * [ ] Task 8.5: Reset stuck daily counter on user `98WVIFYdGrUbjL4jgyXLPe8ICFt1`
* [ ] Phase 3: Post-audit bug fixes
  * [x] Newsletter ReferenceError: `beehiivConfig` → `newsletterRoleConfig` (committed v5.7.1)
  * [x] HTTPS proxy: `serve.js` returns boolean, caller uses `httpsReady` not `httpsEnabled`
  * [x] AI normalizeOptions: array-content system messages now get rules injected
  * [x] Setup warn handling: `warnCount` tracked separately, warns don't trigger retry
  * [x] Copy-paste fix: `sender: 'electron-manager'` → `'backend-manager'`
  * [x] Test: AI array-content-blocks test added + passing (20/20)
  * [x] Fix: consent rules test — write `'forged'` instead of `'granted'` to avoid value collision with prior email-preferences tests
  * [x] Fix: `cancel-too-young` account `timestampUNIX` uses seconds (was ms)
  * [x] Fix: auth on-delete race condition — `deleteTestUsers` uses emulator bulk-clear REST API instead of individual `deleteUser()` calls (eliminates async on-delete triggers that clobbered freshly-created accounts)
  * [x] Diagnostic: auth-delete-race test — proved the race condition (80-100% clobber rate without mitigation), removed after fix verified
  * [x] Commit + publish framework fixes (v5.7.2)
  * [ ] Deploy somiibo-backend + advance stuck sendAt
* [ ] Phase 4: Root package.json proxy scripts
  * [x] Task 4.1: Create `root-package-json.js` setup test (proxies `projectScripts` with `cd functions &&` prefix + `preinstall` guard)
  * [x] Task 4.2: Register in setup test index (after `npm-project-scripts`)
  * [ ] Task 4.3: Test in consumer project (`npx mgr setup` from ultimate-jekyll-backend)
  * [ ] Task 4.4: Verify `npm test` / `npm start` work from project root

## ✅ Completed Task List
* [x] Phase 1: MCP role-based tool scoping + consumer extensibility
  * [x] Foundation utilities (`src/mcp/utils.js`)
  * [x] Add `role` to all 19 tools (`src/mcp/tools.js`)
  * [x] User token support in HTTP client (`src/mcp/client.js`)
  * [x] Stdio server role filtering + consumer tools (`src/mcp/index.js`)
  * [x] CLI `--token` flag + `cwd` passthrough (`src/cli/commands/mcp.js`)
  * [x] HTTP handler — role filtering, OAuth user flow, consumer tool execution (`src/mcp/handler.js`)
  * [x] Test suite — 44 tests across 5 files
  * [x] Documentation — `docs/mcp.md`, `CLAUDE.md`
  * [x] UJM `/token` page update (separate repo)
* [x] Phase 2: HTTPS local dev + Claude Desktop MCP testing
  * [x] HTTPS proxy in `npx mgr serve` (mkcert certs, port 5002 → 5443)
  * [x] `getApiUrl()` returns `https://` when `BEM_HTTPS_PORT` is set
  * [x] Fix OAuth discovery (root-level issuer per RFC 8414)
  * [x] Add dynamic client registration (`POST /mcp/register`)
  * [x] Fix 401 trigger for OAuth flow
  * [x] Tool annotations (title, readOnlyHint, destructiveHint, etc.)
  * [x] Role reassignment (cancel/refund/uuid → admin, user = read-only)
  * [x] Consumer tool override bug fix (listing/execution sync)
  * [x] Test MCP connection in Claude Desktop — verified end-to-end
  * [x] Update tests (44 passing) + docs
