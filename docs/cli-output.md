# CLI Output Styling (`src/cli/utils/ui.js`)

BEM's CLI shares a single styling module so every command renders with the same
look as the **OMEGA Manager** (`omega-manager`): `🚀` banner, 70-char `━`
dividers, indented tree output, dimmed labels, timestamps, and a consistent set
of status symbols. This is the **SSOT for console output** — commands should pull
helpers from here instead of hand-rolling `chalk` + `console.log`.

The module is exposed on every command as `this.ui` (wired in
[`src/cli/commands/base-command.js`](../src/cli/commands/base-command.js)) and can
also be `require('../utils/ui')`'d directly (e.g. from setup-test files).

## Conventions

| Aspect | Value |
|---|---|
| Divider | `━` × 70 (`ui.RULE_WIDTH`, `ui.RULE_CHAR`) |
| Indentation | 2 spaces per level (`ui.indent(level)`) |
| Section label | `[UPPERCASE]` in bold magenta, at indent level 1 |
| Section items | one level deeper than the label (level 2) |
| Timestamp | `new Date().toLocaleTimeString()` (e.g. `7:47:12 PM`) |
| Banner | bold cyan, prefixed with `🚀` |

### Status symbols (`ui.SYMBOLS`)

| Key | Symbol | Color | Meaning |
|---|---|---|---|
| `running` | `→` | dim | step in progress / hint |
| `pass` | `✓` | green | success |
| `fail` | `✗` | red | failure |
| `skip` | `⊘` | dim | skipped / no-op |
| `warn` | `⚠` | yellow | warning |
| `done` | `✅` | green | final success (summary) |
| `add` | `+` | green | created a file/record |
| `change` | `↻` | yellow | modified a file/record |

## API

```js
const ui = require('../utils/ui'); // or this.ui inside a command

ui.banner('Backend Manager v5.2.18');          // 🚀 bold-cyan banner + blank lines
ui.header('Somiibo', { subtitle: url });        // ━ divider / title @ time / ━ divider
ui.section('Checks');                            // blank line + bold-magenta [CHECKS]
ui.field('Project', 'somiibo-91d13', { pad: 9 });// dimmed "Label:" + value (pad aligns columns)
ui.status('pass', 'Stats fetched', { level: 2 });// <symbol> <text> at an indent level
ui.note('All defaults up to date', 2);           // dimmed line at a level
ui.blank();                                      // blank line
ui.rule();                                       // a bare 70-char rule string (cyan)
```

`ui.header(title, opts)`:
- `opts.subtitle` — text after the title (default cyan), e.g. a URL.
- `opts.subtitleColor` — chalk fn for the subtitle.
- `opts.time` — append `@ <time>` (default `true`).
- `opts.color` — chalk fn for the rules (default cyan).

`ui.field(label, value, opts)`:
- `opts.level` — indent level (default 1).
- `opts.pad` — pad the label (incl. colon) to this width for column alignment.
- `opts.valueColor` — chalk fn for the value.

`ui.status(kind, text, opts)`:
- `kind` — one of `running|pass|fail|skip|warn|add|change` (picks symbol + color).
- `opts.level` — indent level (default 1).
- `opts.detail` — dimmed trailing detail string.

### `ui.Summary`

Collects pass/fail outcomes and prints an OMEGA-style summary block (green `✅`
when all passed, yellow `⚠` otherwise).

```js
const summary = new ui.Summary().start();
summary.pass();                       // record a pass
summary.fail('check name', detailsArr);// record a fail with pre-formatted detail lines
summary.print({ hint: 'Fix the above, then run npx mgr setup again.' });
```

`fail()`'s second arg is an array of already-styled lines shown indented under the
failing check in the summary block.

## How `setup` uses it

[`src/cli/commands/setup.js`](../src/cli/commands/setup.js) builds the whole run
from these helpers:

1. `ui.banner(...)` → `ui.header(brand, { subtitle: consoleUrl })` → `ui.field('Project'/'API', ...)`.
2. `ui.section('Defaults')` then `ui.status('add'|'change', ...)` per scaffolded file.
3. `ui.section('Checks')` then the per-check status lines (printed by the test
   runner — see below), with `✓ fixed` / `✗ Could not fix` sub-lines.
4. `ui.section('Stats')` then a pass/skip/warn line.
5. `self.setupSummary.print()` on success.

### Test runner (`Main.prototype.test` in `src/cli/index.js`)

Each setup check prints `    [N] <symbol> <name>`. A check can:
- **pass** → `✓` (recorded via `setupSummary.pass()`).
- **fail then auto-fix** → `⚠ … — fixing…` then `✓ fixed`.
- **fail unfixably** → `✗ Could not fix: <message>`, recorded via
  `setupSummary.fail(name, details)`, then `haltSetup()` prints the summary and
  `process.exit(1)`.

A failing check's `fix()` may attach `error.summaryDetails` (an array of styled
lines) to surface a compact version in the summary block — see
[`setup-tests/bem-config.js`](../src/cli/commands/setup-tests/bem-config.js),
which lists the missing `backend-manager-config.json` keys.

`--continue` records the failure but keeps going instead of halting.

> **No more `UnhandledPromiseRejection`.** Hard failures exit cleanly via
> `haltSetup()` / `process.exit(1)`, and `bin/backend-manager` wraps the run in a
> `try/catch` that prints a one-line `✗ <message>` instead of Node's raw rejection
> dump.

## Adopting it in other commands

`serve`, `deploy`, `test`, `emulator`, etc. can migrate to the same look
incrementally: replace ad-hoc `console.log(chalk...)` with `this.ui.section(...)`,
`this.ui.status(...)`, and `this.ui.field(...)`. The legacy
`log/logError/logSuccess/logWarning` helpers on `BaseCommand` still work for
simple one-off lines.
