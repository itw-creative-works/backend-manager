# Build System

BEM is the deliberate outlier among the four OMEGA frameworks: **consumer projects have no build pipeline**. There is no gulp, no webpack, no bundling — `functions/` runs as-is in the Firebase emulator locally and deploys as-is to Cloud Functions.

## Pipeline overview

| Stage | Command | What happens |
|---|---|---|
| Local dev | `npx mgr emulator` / `npx mgr serve` | Functions run directly from `functions/` source in the Firebase emulator |
| Watch | `npx mgr watch` | Auto-reload functions on file change |
| Ship | `npx mgr deploy` | `functions/` deploys as-is to Firebase Cloud Functions |

There are no build modes — environment behavior is governed by emulator vs production, not a build flag. See [environment-detection.md](environment-detection.md).

## prepare-package (framework-side)

The BEM library itself has one build step: `npm run prepare` copies `src/` → `dist/` via prepare-package (`npm run prepare:watch` for watch mode). Consumers always require from `dist/`. This mirrors the framework-side prepare step in EM/BXM/UJM.

At publish time, a `prepublishOnly` script first removes the self-test fixture's runtime `node_modules` (`src/test/fixtures/firebase-project/functions/node_modules`) — its `backend-manager` symlink points back at the repo root, which would send prepare-package's publish-time cleanup walk into an infinite cycle. The symlinks are throwaway; the next `npx mgr test` self-test regenerates them (see [test-boot-layer.md](test-boot-layer.md)).

## Log files

CLI commands tee output to `functions/*.log` (`dev.log`, `emulator.log`, `test.log`, `production.log`). Full reference: [logging.md](logging.md).

## See also

- [architecture.md](architecture.md) — Manager class, dual-mode support (`firebase` / `custom`)
- [directory-structure.md](directory-structure.md) — BEM library + consumer project layout
- [test-framework.md](test-framework.md) — the emulator-based test harness
