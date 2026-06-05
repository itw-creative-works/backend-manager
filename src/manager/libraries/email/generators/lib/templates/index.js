/**
 * Unified template registry — all email templates in one place.
 *
 * Two resolve functions because the two systems have different input shapes:
 *   - resolveEmailTemplate('card')        → card/plain/order/feedback (used by renderEmail)
 *   - resolveNewsletterTemplate('clean')   → clean/editorial/field-report (used by renderNewsletter)
 */

// --- Email templates (transactional + marketing) ---
const card = require('./card.js');
const plain = require('./plain.js');
const order = require('./order.js');
const feedback = require('./feedback.js');

const EMAIL_TEMPLATES = { card, plain, order, feedback };

function resolveEmailTemplate(name) {
  const resolved = EMAIL_TEMPLATES[name];
  if (!resolved) {
    console.warn(`Email template "${name}" not found, falling back to card`);
    return EMAIL_TEMPLATES.card;
  }
  return resolved;
}

// --- Newsletter templates ---
const clean = require('./clean.js');
const editorial = require('./editorial');
const fieldReport = require('./field-report');

const NEWSLETTER_TEMPLATES = { clean, editorial, 'field-report': fieldReport };

function resolveNewsletterTemplate(name) {
  return NEWSLETTER_TEMPLATES[name] || NEWSLETTER_TEMPLATES.clean;
}

function listNewsletterTemplates() {
  return Object.values(NEWSLETTER_TEMPLATES).map((t) => t.meta);
}

module.exports = {
  EMAIL_TEMPLATES,
  NEWSLETTER_TEMPLATES,
  resolveEmailTemplate,
  resolveNewsletterTemplate,
  listNewsletterTemplates,
};
