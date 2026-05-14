/**
 * Helpers for the `field-report` template.
 *
 * Field Report aesthetic = wire-service correspondent + Bloomberg terminal.
 * The helpers below encode the conventions that make that look feel coherent:
 *   - mono "kicker" labels in oxblood (a darker, more editorial primary)
 *   - "VOL. NNNN" issue numbering (continues the editorial issue counter so
 *     the brand reads as a single ongoing publication across templates)
 *   - terminal-style data callouts ("// THIS ISSUE //" and per-dispatch
 *     data tables) rendered as black bg + mono green-on-black, evoking
 *     a trader's terminal
 *   - dateline formatting ("MAY 12 · LOS ANGELES")
 *
 * Lives separately from shared.js (which is template-agnostic) and from
 * editorial-helpers.js (which encodes a totally different aesthetic).
 */
const { escape } = require('./shared.js');
const { computeIssueNumber } = require('./editorial-helpers.js');

const SERIF_FONT = `'Tiempos Headline', 'Tiempos Text', Georgia, 'Times New Roman', serif`;
const MONO_FONT  = `'JetBrains Mono', 'IBM Plex Mono', Menlo, Consolas, monospace`;

// Terminal palette — used by the TLDR block and per-dispatch data callouts.
// Always rendered against any brand color theme — the terminal block is a
// fixed visual anchor that says "this is a Field Report" regardless of brand.
const TERMINAL = {
  bg:    '#0d1117',  // near-black, slightly cooler than pure black
  fg:    '#7fffb0',  // muted phosphor green
  label: '#ff6b6b',  // alert red for labels
  rule:  '#1f2937',  // subtle grid rule
};

// Default oxblood/ink primary — overridden by theme.primaryColor if set.
const DEFAULT_INK = '#7a1f1f';

/**
 * Render a mono "kicker" label. Goes above a headline. Examples:
 *   - "DISPATCH"
 *   - "FIELD NOTES"
 *   - "WATCH"
 *   - "BRIEF"
 * Uppercase, heavy letter-spacing, in the ink color.
 */
function kicker({ text, color }) {
  return `<div style="font-family: ${MONO_FONT}; font-size: 10px; letter-spacing: 4px; text-transform: uppercase; font-weight: 700; color: ${color || DEFAULT_INK};">${escape(text || '')}</div>`;
}

/**
 * Build the issue strap shown at the very top of the newsletter:
 *   "VOL. 0863 · MAY 12, 2026 · LOS ANGELES"
 * The Volume number is the same monotonic counter editorial uses, so the
 * brand has one continuous "issue history" regardless of which template
 * shipped the issue.
 */
function issueStrap({ now, dateline }) {
  const d = now || new Date();
  const vol = computeIssueNumber(d);
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  const placePart = dateline ? ` · ${escape(dateline.toUpperCase())}` : '';
  return `VOL. ${vol} · ${datePart}${placePart}`;
}

/**
 * Per-dispatch dateline. Combines location + a short date.
 * Returns e.g. "REMOTE · MAY 12" or "NEW YORK · MAY 12".
 */
function dispatchDateline({ now, location }) {
  const d = now || new Date();
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  const loc = (location || 'REMOTE').toUpperCase();
  return `${escape(loc)} · ${escape(datePart)}`;
}

/**
 * Render the per-dispatch "data callout" — a small terminal-style block
 * with up to 4 label/value pairs. Used as the right-column rail next to
 * the dispatch body, OR as a full-width strip below the headline when
 * the dispatch has no body image.
 *
 * dataPoints: [{ label, value }]
 * Returns '' when empty.
 */
function dataCallout({ dataPoints, padding, fullWidth }) {
  if (!Array.isArray(dataPoints) || !dataPoints.length) {
    return '';
  }

  const rows = dataPoints.slice(0, 4).map((dp) => `
            <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; border-bottom: 1px solid ${TERMINAL.rule};">
              <span style="font-family: ${MONO_FONT}; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: ${TERMINAL.label};">${escape(dp.label || '')}</span>
              <span style="font-family: ${MONO_FONT}; font-size: 16px; font-weight: 700; color: ${TERMINAL.fg};">${escape(dp.value || '')}</span>
            </div>`).join('');

  const label = fullWidth
    ? `<div style="font-family: ${MONO_FONT}; font-size: 10px; letter-spacing: 4px; color: ${TERMINAL.label}; margin-bottom: 12px;">// BY THE NUMBERS //</div>`
    : `<div style="font-family: ${MONO_FONT}; font-size: 10px; letter-spacing: 4px; color: ${TERMINAL.label}; margin-bottom: 12px;">// DATA //</div>`;

  return `<div style="background: ${TERMINAL.bg}; padding: ${padding || '20px'}; color: ${TERMINAL.fg};">
          ${label}
          ${rows}
        </div>`;
}

/**
 * TLDR strip rendered immediately under the masthead. Mono green-on-black,
 * blinking-cursor vibe. Always one paragraph max.
 */
function tldrStrip({ tldr, gutter }) {
  if (!tldr) {
    return '';
  }

  return `<div style="background: ${TERMINAL.bg}; padding: 28px ${gutter}; color: ${TERMINAL.fg};">
          <div style="font-family: ${MONO_FONT}; font-size: 10px; letter-spacing: 4px; color: ${TERMINAL.label}; margin-bottom: 14px;">// THIS ISSUE //</div>
          <div style="font-family: ${MONO_FONT}; font-size: 14px; line-height: 1.65; color: ${TERMINAL.fg};">${escape(tldr)}<span style="color: ${TERMINAL.label};">_</span></div>
        </div>`;
}

/**
 * End-of-dispatch terminator. Appears at the bottom of each dispatch,
 * before the divider to the next one. Like the "30" mark in old wire copy.
 */
function dispatchTerminator({ inkColor }) {
  return `<div style="text-align: center; font-family: ${MONO_FONT}; font-size: 10px; letter-spacing: 6px; color: ${inkColor || DEFAULT_INK}; padding: 0 0 0 0;">— END DISPATCH —</div>`;
}

module.exports = {
  SERIF_FONT,
  MONO_FONT,
  TERMINAL,
  DEFAULT_INK,
  kicker,
  issueStrap,
  dispatchDateline,
  dataCallout,
  tldrStrip,
  dispatchTerminator,
};
