# Logging

BEM CLI commands automatically save all output to log files while still streaming to the console. **BEM's logs live in `<projectDir>/functions/`, not `logs/`** — a deliberate exception to the cross-framework convention so they sit beside firebase-tools' own `*-debug.log` files and everything can be grepped from one directory.

## Log files

All in `<projectDir>/functions/`:

| File | Source | Lifetime |
|---|---|---|
| `dev.log` | `npx mgr serve` — BEM's local dev server (Firebase serve) | Overwritten each run |
| `emulator.log` | `npx mgr emulator` — full emulator output (Firebase emulator + Cloud Functions logs); also `npx mgr test` when it starts its own emulator | Overwritten each run |
| `test.log` | `npx mgr test` runner output when running against an already-running emulator | Overwritten each run |
| `production.log` | `npx mgr logs:read` / `npx mgr logs:tail` — production Cloud Function logs from Google Cloud Logging (raw JSON for `read`, streaming text for `tail`) | Overwritten each run |

The `dev`/`test` names match EM/BXM/UJM for cross-framework parity.

## What gets captured

When `npx mgr test` starts its own emulator, logs go to `emulator.log` (it delegates to the emulator command). When running against an already-running emulator, logs go to `test.log`.

All files are gitignored via `*.log`. Reset sentinels (`*.log.reset`), the watch trigger file, and `test-mode.json` live separately in `<projectDir>/.temp/` — they're transient internal signals with no debugging value.

## See also

- [cli-logs.md](cli-logs.md) — `npx mgr logs:read` / `logs:tail` flag reference (the commands that feed `production.log`)
- [test-framework.md](test-framework.md) — the test runner that feeds `test.log` / `emulator.log`
