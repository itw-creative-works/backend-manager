# CDP Debugging (driving a live browser)

How to drive a browser you can CONTROL — see the frontend live, screenshot it, click, type, read console logs, inspect network requests against your routes — for agents (Claude via MCP/CDP) and humans.

> Mirrored across the five sister frameworks (UJM / BEM / BXM / EM / WM) — same core section, framework-flavored. Edit all five together.

## The browser: your Claude session owns one

Browser work runs through the **`chrome-devtools` MCP** (via mcp-router). There is NO launch procedure anymore — no ports, no profile dirs, no curl checks:

- **Just call the tools** — `new_page`, `navigate_page`, `take_screenshot`, `click`, `fill`, `evaluate_script`, `list_console_messages`, `list_network_requests`. The browser auto-launches on the first call.
- **Each Claude session gets its OWN private Chrome** (`--isolated`): temp profile, CDP over an internal pipe. Parallel sessions cannot see or touch each other's pages — open and close pages freely, the whole browser is yours.
- **It dies with the session.** No orphans, no cleanup, nothing to kill.
- **Ephemeral profile** — cookies/logins do NOT persist between sessions. If a flow needs auth, log in during the task.
- **Self-signed HTTPS is pre-accepted** (`--acceptInsecureCerts` in the upstream) — dev servers load without certificate interstitials.
- **NEVER quit/kill Chrome by app name** (`killall "Google Chrome"`, osascript) — that's the user's personal browser, not yours.

Humans: the agent's Chrome window is visible — you can watch it drive. Full reference: `~/.claude/mcp-server/servers/chrome-devtools/CLAUDE.md`.

## Electron apps are the exception (attach, don't launch)

An Electron dev app is a running singleton — you ATTACH to it instead of launching a browser: the `chrome-devtools-electron` MCP upstream (reads `EM_CDP_PORT`, default 9222, expanded once at session start) or EM's per-invocation `npx mgr cdp`. See EM's `docs/cdp-debugging.md`.

## BEM specifics

- **The UJM dev site URL is `https://localhost:4000` — NEVER the LAN IP** (`https://192.168.x.x:...`). Port 4000 by default, increments (4001, …) when multiple sites run; the exact port is in `.temp/_config_browsersync.yml` at the root of the WEBSITE project (the UJM consumer — e.g. `<brand>-website/.temp/_config_browsersync.yml`, NOT this backend repo).
- The network tab is the payoff: `list_network_requests` shows every call the frontend makes to your routes — method, status, and payloads — while you click through the real UI.
- **Auth'd flows**: the profile is ephemeral, so log in through the real UI at the start of the session (test creds) — then exercise the authenticated routes.
- Backend-side observation stays where it always was: `npx mgr logs` (gcloud logs) and the emulator suite; this doc only covers the browser half of the loop.
