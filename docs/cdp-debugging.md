# CDP Debugging (driving a live browser)

How to launch a browser you can CONTROL — see a site live, screenshot it, click, type, read console logs, inspect network requests — for agents (Claude via MCP/CDP) and humans. BEM has no UI of its own; reach for this when **verifying the frontend that consumes your backend** (the UJM site, a deployed app): drive the auth flow, watch the network panel for calls to your routes, read the actual request/response payloads.

> Mirrored across the four sister frameworks (UJM / BEM / BXM / EM) — same core section, framework-flavored. Edit all four together.

## Launching a controllable Chrome (the canonical command)

```bash
open -gna "Google Chrome" --args \
  --remote-debugging-port=9223 \
  --user-data-dir="$HOME/Library/Application Support/chrome-profiles/agent" \
  --no-first-run --no-default-browser-check \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  https://localhost:4000          # ← the frontend talking to your backend (or the IP from .temp/_config_browsersync.yml if localhost doesn't connect)
```

Verify it's up: `curl -s http://127.0.0.1:9223/json/version`

The rules that make this work (each one learned the hard way):

- **`open -gna` launches WITHOUT stealing focus.** `-g` = don't bring to foreground, `-n` = new instance (required — without it `open` just activates the already-running daily Chrome and the `--args` are ignored). Launching the Chrome binary directly ALWAYS activates the app and steals focus. Do NOT use `-j`/`--hide` — animations need a visible window; instead the three `--disable-*` flags keep timers/rAF/rendering at FULL speed while the window sits behind your work (verified: rAF at the display's native 120fps while backgrounded, focus never moved).
- **`--user-data-dir` is REQUIRED, not optional.** Chrome 136+ **silently ignores** `--remote-debugging-port` on the default profile — no error, no port, nothing (verified on Chrome 149). This is the #1 "why isn't CDP up" trap.
- **The profile dir IS the persistent login state.** Cookies + localStorage survive relaunches (verified by round-trip). **Log into sites once in the agent profile and every agent reuses the authenticated state** — auth'd flows against your routes work without re-login. Ecosystem convention: ONE shared profile at `~/Library/Application Support/chrome-profiles/agent` across all four frameworks, so logins are a one-time setup.
- **One Chrome instance per profile dir — but MANY agents per instance.** CDP is multi-client (verified: two concurrent clients driving different tabs of one instance): agents and sessions attach to the SAME port, each drives its own tab, and all share the profile's logins. One agent per tab is the only rule. A second launch with the same dir just opens a window in the existing instance and **ignores the new debug port** — attach to the running one instead. Reach for a second profile + port (`…/b` on 9224) only for a different IDENTITY (a different account = a different cookie jar) or hard isolation.
- It runs **side-by-side with the daily Chrome** — a different `--user-data-dir` is a fully separate instance.
- **Quit by profile match, never by app name**: `pkill -f "chrome-profiles/agent"`. (`osascript 'tell app "Google Chrome" to quit'` hits the daily browser too — same app name.)

## Driving it

| Client | Good for | Port handoff |
|---|---|---|
| `chrome-devtools` MCP | rich interaction — click, fill, type, screenshots, network requests, console messages, performance traces | `CHROME_CDP_PORT` env var, **expanded ONCE when the Claude session spawns its MCP — set it BEFORE launching `claude`** (mid-session changes do nothing) |
| Any CDP client — including EM's `npx mgr cdp` run from any EM project | quick JS eval, per-renderer screenshots | per invocation: `EM_CDP_PORT=9223 npx mgr cdp eval ":4000" 'document.title'` |

Port conventions: **9222** = Electron apps (EM), **9223+** = Chrome instances.

## BEM specifics

- **The UJM dev site is HTTPS.** BrowserSync serves over HTTPS (self-signed cert). Prefer `https://localhost:4000`; fall back to the machine's local network IP (e.g. `https://192.168.x.x:4000`) if localhost doesn't connect. Port 4000 by default, increments to 4001+ when multiple sites run. The exact URL is in `.temp/_config_browsersync.yml` at the root of the WEBSITE project (the UJM consumer — e.g. `<brand>-website/.temp/_config_browsersync.yml`, NOT this backend repo) — read that file first, every time, before navigating.
- The network tab is the payoff: `list_network_requests` shows every call the frontend makes to your routes — method, status, and payloads — while you click through the real UI.
- Backend-side observation stays where it always was: `npx mgr logs` (gcloud logs) and the emulator suite; this doc only covers the browser half of the loop.
