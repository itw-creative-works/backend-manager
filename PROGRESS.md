# Project Progress Tracker
> Agents and maintainers should update this file regularly to reflect the current state of the project.

## 🎯 Current Focus
* **Goal:** Root package.json proxy for running scripts from project root
* **Current Phase:** Implementation complete, untested in consumer
* **Priority:** Medium
* **Last Updated:** 2026-06-17 7:40 PM PDT
* **Notes:** v5.7.2 shipped (npm + GitHub release). New setup test `root-package-json` generates a root `package.json` with proxy scripts so `npm test`/`npm start`/etc. work from the Firebase project root (not just `functions/`). Includes `preinstall` guard to block accidental `npm install` at root.

## 📌 Active Task List
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
