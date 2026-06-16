const chalk = require('chalk').default;

/**
 * Shared CLI styling helpers — the SSOT for BEM's console output look.
 *
 * Mirrors the OMEGA Manager (omega-manager) styling conventions so every BEM
 * command renders with the same dividers, indentation, timestamps, colors, and
 * status symbols. Pull these helpers into any command (setup/serve/deploy/test/
 * emulator/...) instead of hand-rolling chalk + console.log.
 *
 * Conventions (matching OMEGA):
 *   - 70-char `━` horizontal rules wrap section titles.
 *   - Indentation is 2 spaces per level (level 1 = 2 spaces, level 2 = 4, ...).
 *   - Dimmed labels (`ID:`, `URL:`, `Local:`) with normal-weight values.
 *   - Status symbols: → (running) ✓ (pass) ✗ (fail) ⊘ (skip) ⚠ (warn) ✅ (done).
 *   - Timestamps via `new Date().toLocaleTimeString()` (e.g. "7:47:12 PM").
 */

// Divider width + character (OMEGA uses 70 × `━`).
const RULE_WIDTH = 70;
const RULE_CHAR = '━';

// Status symbols — the single source of truth for BEM's CLI iconography.
const SYMBOLS = {
  running: '→',
  pass: '✓',
  fail: '✗',
  skip: '⊘',
  warn: '⚠',
  done: '✅',
  rocket: '🚀',
  add: '+',
  change: '↻',
};

/** Two-space-per-level indentation. */
function indent(level = 1) {
  return '  '.repeat(level);
}

/** Locale time string, e.g. "7:47:12 PM". */
function timestamp() {
  return new Date().toLocaleTimeString();
}

/** A full-width horizontal rule in the given chalk color (default cyan). */
function rule(color = chalk.cyan) {
  return color(RULE_CHAR.repeat(RULE_WIDTH));
}

/** Print a blank line. */
function blank() {
  console.log('');
}

/**
 * Print the top-level program banner, e.g. `🚀 Backend Manager`.
 * @param {string} title
 */
function banner(title) {
  blank();
  console.log(chalk.bold.cyan(`${SYMBOLS.rocket} ${title}`));
  blank();
}

/**
 * Print a divider-wrapped section header with an optional subtitle + timestamp.
 *
 *   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *     Title  subtitle  @ 7:47:12 PM
 *   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * @param {string} title - Bold white title.
 * @param {object} [opts]
 * @param {string} [opts.subtitle] - Dimmed/colored text after the title (e.g. a URL).
 * @param {Function} [opts.subtitleColor] - chalk fn for the subtitle (default cyan).
 * @param {boolean} [opts.time=true] - Append `@ <time>`.
 * @param {Function} [opts.color] - chalk fn for the rules (default cyan).
 */
function header(title, opts = {}) {
  const color = opts.color || chalk.cyan;
  const subtitleColor = opts.subtitleColor || chalk.cyan;
  const time = opts.time !== false;

  const parts = [chalk.bold.white(title)];
  if (opts.subtitle) {
    parts.push(subtitleColor(opts.subtitle));
  }
  if (time) {
    parts.push(chalk.dim(`@ ${timestamp()}`));
  }

  console.log(rule(color));
  console.log(`${indent(1)}${parts.join('  ')}`);
  console.log(rule(color));
}

/**
 * Print a magenta section label like `[SETUP]`.
 * @param {string} label
 */
function section(label) {
  blank();
  console.log(`${indent(1)}${chalk.bold.magenta(`[${String(label).toUpperCase()}]`)}`);
}

/**
 * Print a dimmed `Label: value` line at a given indent level.
 * @param {string} label
 * @param {string} value
 * @param {object} [opts]
 * @param {number} [opts.level=1]
 * @param {number} [opts.pad] - Pad the label (incl. trailing colon) to this width for alignment.
 * @param {Function} [opts.valueColor] - chalk fn for the value (default none).
 */
function field(label, value, opts = {}) {
  const level = opts.level || 1;
  let labelText = `${label}:`;
  if (opts.pad) {
    labelText = labelText.padEnd(opts.pad);
  }
  const valueText = opts.valueColor ? opts.valueColor(value) : value;
  console.log(`${indent(level)}${chalk.dim(labelText)} ${valueText}`);
}

/**
 * Print a status line: `<symbol> <text>` at a given indent level.
 * @param {('running'|'pass'|'fail'|'skip'|'warn'|'add'|'change')} kind
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.level=1]
 * @param {string} [opts.detail] - Dimmed trailing detail.
 */
function status(kind, text, opts = {}) {
  const level = opts.level || 1;
  const colorByKind = {
    running: chalk.dim,
    pass: chalk.green,
    fail: chalk.red,
    skip: chalk.dim,
    warn: chalk.yellow,
    add: chalk.green,
    change: chalk.yellow,
  };
  const color = colorByKind[kind] || chalk.white;
  const symbol = SYMBOLS[kind] || '';
  const detail = opts.detail ? ` ${chalk.dim(opts.detail)}` : '';
  console.log(`${indent(level)}${color(symbol)} ${text}${detail}`);
}

/** Print a plain dimmed note line. */
function note(text, level = 1) {
  console.log(`${indent(level)}${chalk.dim(text)}`);
}

/**
 * Collects setup-check results and prints an OMEGA-style summary block.
 *
 * Used by the setup command's test runner. `start()` stamps a wall-clock so the
 * summary can report duration; `passed()` / `failed()` record outcomes; the
 * failing check (if any) carries optional detail lines to surface in the block.
 */
class Summary {
  constructor() {
    this.startTime = null;
    this.passes = 0;
    this.warns = [];
    this.fails = [];
  }

  start() {
    this.startTime = Date.now();
    return this;
  }

  pass() {
    this.passes++;
  }

  /**
   * @param {string} name - Check name.
   * @param {string[]} [details] - Pre-formatted detail lines to show under the warning.
   */
  warn(name, details = []) {
    this.warns.push({ name, details });
  }

  /**
   * @param {string} name - Check name.
   * @param {string[]} [details] - Pre-formatted detail lines to show under the failure.
   */
  fail(name, details = []) {
    this.fails.push({ name, details });
  }

  get total() {
    return this.passes + this.warns.length + this.fails.length;
  }

  /**
   * Format milliseconds into "Xs" / "Xm Ys" / "Xh Ym Zs".
   * @param {number} ms
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remSeconds = seconds % 60;
    if (minutes < 60) {
      return `${minutes}m ${remSeconds}s`;
    }
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h ${remMinutes}m ${remSeconds}s`;
  }

  /**
   * Print the summary block. Green ✅ when everything passed, yellow ⚠ otherwise.
   * @param {object} [opts]
   * @param {string} [opts.hint] - A closing call-to-action line (e.g. how to re-run).
   */
  print(opts = {}) {
    const hasErrors = this.fails.length > 0;
    const hasWarnings = this.warns.length > 0;
    const headerColor = hasErrors ? chalk.yellow : chalk.green;
    const icon = hasErrors ? SYMBOLS.warn : SYMBOLS.done;
    const elapsed = this.startTime ? this._formatDuration(Date.now() - this.startTime) : '0s';

    blank();
    console.log(headerColor(RULE_CHAR.repeat(RULE_WIDTH)));
    console.log(`${indent(1)}${headerColor.bold(`${icon} Summary`)}`);
    console.log(headerColor(RULE_CHAR.repeat(RULE_WIDTH)));

    blank();
    field('Checks', String(this.total), { pad: 11 });
    field('Duration', elapsed, { pad: 11 });
    const parts = [chalk.green(`${this.passes} passed`)];
    if (hasWarnings) {
      parts.push(chalk.yellow(`${this.warns.length} warned`));
    }
    parts.push(hasErrors ? chalk.red(`${this.fails.length} failed`) : chalk.dim('0 failed'));
    field('Results', parts.join(chalk.dim(', ')), { pad: 11 });

    if (hasWarnings) {
      blank();
      for (const { name, details } of this.warns) {
        console.log(`${indent(1)}${chalk.yellow(SYMBOLS.warn)} ${chalk.bold(name)}`);
        for (const line of details) {
          console.log(`${indent(3)}${line}`);
        }
      }
    }

    if (hasErrors) {
      blank();
      for (const { name, details } of this.fails) {
        console.log(`${indent(1)}${chalk.red(SYMBOLS.fail)} ${chalk.bold(name)}`);
        for (const line of details) {
          console.log(`${indent(3)}${line}`);
        }
      }
    }

    if (opts.hint) {
      blank();
      console.log(`${indent(1)}${chalk.dim(SYMBOLS.running)} ${opts.hint}`);
    }

    blank();
    console.log(headerColor(RULE_CHAR.repeat(RULE_WIDTH)));
  }
}

module.exports = {
  chalk,
  RULE_WIDTH,
  RULE_CHAR,
  SYMBOLS,
  indent,
  timestamp,
  rule,
  blank,
  banner,
  header,
  section,
  field,
  status,
  note,
  Summary,
};
