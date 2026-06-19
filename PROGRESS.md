# Project Progress Tracker
> Agents and maintainers should update this file regularly to reflect the current state of the project.

## 🎯 Current Focus
* **Goal:** RSS/Atom feed-based article generation for the Ghostii system
* **Current Phase:** Implementation complete, pending deploy
* **Priority:** High
* **Last Updated:** 2026-06-18 6:45 PM PDT
* **Notes:** All code + tests complete. Found and fixed humanizer bug — `injectBurstiness` was destroying markdown links by splitting on commas inside `[text](url)` syntax. Fixed with protect-and-restore pattern. Also fixed 403 links treated as "working" in verification step. Ghostii backend needs deploy.

## 📌 Active Task List
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
  * [ ] Task 5.19: Deploy Ghostii backend
  * [ ] Task 5.17: Publish BEM with feed support
  * [ ] Task 5.12: Publish BEM with feed support
  * [ ] Task 5.13: Configure consumer project(s) with `$feed:` sources
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
