# Project Progress Tracker
> Agents and maintainers should update this file regularly to reflect the current state of the project.

## 🎯 Current Focus
* **Goal:** Fix blog auto-publisher duplicate posts + unauthorized $brand fallback
* **Current Phase:** Code complete, pending test + publish
* **Priority:** High
* **Last Updated:** 2026-06-30 2:10 AM PDT
* **Notes:** Daily Embers getting duplicate articles (Apple price hike from Guardian+NYT) and unauthorized $brand articles (lifestyle tech posts with `source: null` despite $brand not being in sources array). Three fixes: (1) conditional $brand fallback — only if in sources, (2) cross-feed title dedup via word-overlap similarity, (3) stronger topic avoidance prompt. Also added source retry loop in harvest() so exhausted feeds try other sources before skipping.

## 📌 Active Task List
* [ ] Phase 9: Blog auto-publisher dedup + fallback fixes
  * [x] Task 9.1: Diagnose — $brand fallback ignoring user config, per-feed-only dedup, weak prompt
  * [x] Task 9.2: Add `getRecentTitles` to source-resolver.js (collects both postTitle + itemTitle)
  * [x] Task 9.3: Conditional $brand fallback in `resolveSource()` — only if in entry.sources
  * [x] Task 9.4: Source retry loop in `harvest()` — shuffle + try all sources before skipping
  * [x] Task 9.5: Strengthen topic dedup prompt (STRICT, forbid same theme/keyword combo)
  * [x] Task 9.6: Track item titles in runTitles for within-run prompt dedup
  * [x] Task 9.7: Update docs (ghostii.md — feed flow, fallback behavior, dedup levels)
  * [x] Task 9.8: Remove cross-feed title similarity check (too fragile — word-overlap heuristic)
  * [ ] Task 9.9: Run tests (`npx mgr test mgr:helpers/content/blog-auto-publisher`)
  * [ ] Task 9.10: Publish BEM + deploy Daily Embers
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
