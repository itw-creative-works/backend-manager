/**
 * Template registry — newsletter layouts.
 *
 * Each template module exports:
 *   - build({ structure, imagePaths, theme, brandName, brandUrl, brandAddress, now, sponsorships }) → MJML string
 *   - meta: { name, description, requires, optional, supports }
 *
 * Choose via `marketing.beehiiv.content.template` in config (defaults to `clean`).
 */
const clean = require('./clean.js');
const editorial = require('./editorial.js');
const fieldReport = require('./field-report.js');

const TEMPLATES = {
  clean,
  editorial,
  'field-report': fieldReport,
};

function resolveTemplate(name) {
  return TEMPLATES[name] || TEMPLATES.clean;
}

function listTemplates() {
  return Object.values(TEMPLATES).map((t) => t.meta);
}

module.exports = { TEMPLATES, resolveTemplate, listTemplates };
