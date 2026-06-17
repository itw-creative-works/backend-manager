# Project Progress Tracker
> Agents and maintainers should update this file regularly to reflect the current state of the project.

## 🎯 Current Focus
* **Goal:** Fix newsletter generation ReferenceError (beehiivConfig → newsletterRoleConfig)
* **Current Phase:** Fix applied, pending deploy + Firestore sendAt reset
* **Priority:** High
* **Last Updated:** 2026-06-17 4:10 PM PDT
* **Notes:** v5.5.0 refactor missed renaming `beehiivConfig` at 3 sites in newsletter.js (lines 331, 336, 340). Fix applied to framework source. Consumer (somiibo-backend) needs deploy + Firestore `_recurring-newsletter.sendAt` advanced to 1782322200 (Jun 24 17:30 UTC). Separate issue: Beehiiv send API requires Enterprise plan — all generated newsletters fail at send step.

## 📌 Active Task List
* [ ] Phase 3: Newsletter generation fix (beehiivConfig ReferenceError)
  * [x] Diagnose: traced prod logs + Firestore to find generation crashes after AI completes
  * [x] Root cause: v5.5.0 missed renaming `beehiivConfig` → `newsletterRoleConfig` at lines 331/336/340
  * [x] Fix applied to framework source (`src/manager/libraries/email/generators/newsletter.js`)
  * [ ] Commit + publish framework fix
  * [ ] Deploy consumer (somiibo-backend): `cd functions && npx mgr deploy`
  * [ ] Advance stuck sendAt: `npx mgr firestore:set marketing-campaigns/_recurring-newsletter --merge --data '{"sendAt": 1782322200}'`

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
