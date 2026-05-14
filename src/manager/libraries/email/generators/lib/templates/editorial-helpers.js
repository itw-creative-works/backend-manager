/**
 * Helpers used by editorial / magazine-style templates.
 *
 * Lives separately from shared.js because these are NOT general-purpose
 * primitives — they encode editorial-specific conventions (pull-quotes,
 * issue numbering, serif eyebrow labels). Templates that want this aesthetic
 * import from here; other templates (clean, future minimal/digest variants)
 * don't touch this file.
 */
const { escape } = require('./shared.js');

const SERIF_FONT = 'Georgia, \'Times New Roman\', serif';

const EYEBROW_STYLE = 'font-size: 11px; letter-spacing: 4px; text-transform: uppercase; font-weight: 700;';

/**
 * Render an "eyebrow" — a small uppercase tracked label used above headlines
 * and over closing cards. Pass a `color` to tint it; defaults to 'inherit'.
 */
function eyebrow({ text, color, marginBottom }) {
  const extra = marginBottom ? ` margin-bottom: ${marginBottom};` : '';
  return `<div style="${EYEBROW_STYLE} color: ${color || 'inherit'};${extra}">${escape(text)}</div>`;
}

/**
 * Pick a quotable sentence from a body of text. Returns the longest sentence
 * between 60 and 180 characters, biased toward sentences containing hook
 * words like "means", "matters", "practical", "risk", etc.
 */
function pullQuoteFrom(body) {
  if (!body) {
    return null;
  }

  const sentences = body
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 60 && s.length <= 180);

  if (!sentences.length) {
    return null;
  }

  const hooks = /\b(means|matters|will|should|need|important|key|critical|practical|takeaway|risk|trust)\b/i;
  const hooked = sentences.find((s) => hooks.test(s));

  return hooked || sentences.sort((a, b) => b.length - a.length)[0];
}

/**
 * Remove a sentence from a body. Used to avoid duplicating the pull-quote
 * in the running body text.
 */
function stripSentence(body, sentence) {
  if (!body || !sentence) {
    return body || '';
  }

  const escaped = sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\s*${escaped}\\s*`, '');

  return body.replace(pattern, ' ').trim();
}

/**
 * "Issue 0863 · May 12, 2026"-style line. The number is monotonically
 * increasing since 2024-01-01, so a daily newsletter gets a stable
 * issue number per day.
 */
function issueLine({ now, prefix }) {
  const d = now || new Date();
  return {
    number: computeIssueNumber(d),
    date: formatIssueDate(d),
    line: `${prefix || 'Issue'} ${computeIssueNumber(d)} · ${formatIssueDate(d)}`,
  };
}

function formatIssueDate(date) {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function computeIssueNumber(date) {
  const epoch = new Date('2024-01-01T00:00:00Z');
  const days = Math.floor((date.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));

  return String(days).padStart(4, '0');
}

module.exports = {
  SERIF_FONT,
  EYEBROW_STYLE,
  eyebrow,
  pullQuoteFrom,
  stripSentence,
  issueLine,
  formatIssueDate,
  computeIssueNumber,
};
