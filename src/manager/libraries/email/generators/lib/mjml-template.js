/**
 * MJML newsletter template — turns a structured newsletter into email-safe HTML.
 *
 * Dispatches by `newsletterConfig.template` into one of the layouts in
 * `./templates/` and compiles the resulting MJML to HTML.
 *
 * Templates are pure builders — they take the structured data + theme tokens
 * and return MJML. This file owns the compilation, UTM tagging, and brand
 * resolution that's identical across templates.
 */
const mjml = require('mjml');

const { resolveTemplate } = require('./templates/index.js');
const { formatAddress } = require('./templates/shared.js');
const { tagLinks } = require('../../utm');

const DEFAULT_THEME = {
  primaryColor:   '#5B5BFF',
  secondaryColor: '#1E1E2A',
  accentColor:    '#F6F7FB',
  font:           'Inter, system-ui, sans-serif',
};

const DEFAULT_TEMPLATE = 'clean';

/**
 * Render the newsletter to email-safe HTML.
 *
 * @param {object} args
 * @param {object} args.brand - { name, id, url }
 * @param {object} args.newsletterConfig - marketing.beehiiv.content (theme, template, ...)
 * @param {object} args.structure - Output from structure.js
 * @param {string[]} args.imagePaths - One entry per section (URL or local path)
 * @param {string} [args.campaign] - Used for UTM utm_campaign
 * @param {string} [args.template] - Template override (otherwise newsletterConfig.template)
 * @param {Array<object>} [args.sponsorships] - Brand-owned sponsorship promos to inject (merged with config)
 * @returns {Promise<{mjml: string, html: string, template: string, errors: object[]}>}
 */
async function renderNewsletter({ brand, newsletterConfig, structure, imagePaths, campaign, template, sponsorships }) {
  const theme = { ...DEFAULT_THEME, ...(newsletterConfig?.theme || {}) };
  const brandName = brand?.name || 'Newsletter';
  const brandUrl = brand?.url || '#';
  const brandId = brand?.id || '';
  const brandAddress = formatAddress(brand?.address);

  const templateName = template || newsletterConfig?.template || DEFAULT_TEMPLATE;
  const builder = resolveTemplate(templateName);

  // Resolve sponsorships: per-call override beats per-campaign beats config defaults
  const resolvedSponsorships = Array.isArray(sponsorships) && sponsorships.length
    ? sponsorships
    : (newsletterConfig?.sponsorships || []);

  const mjmlString = builder.build({
    structure,
    imagePaths,
    theme,
    brandName,
    brandUrl,
    brandAddress,
    sponsorships: resolvedSponsorships,
    now: new Date(),
  });

  const compiled = await mjml(mjmlString, { validationLevel: 'soft' });

  if (compiled.errors?.length) {
    // Soft — log but don't throw. MJML often emits warnings that don't affect output.
    // eslint-disable-next-line no-console
    console.warn('MJML compilation warnings:', compiled.errors.map((e) => e.message));
  }

  const html = tagLinks(compiled.html, {
    brandUrl,
    brandId,
    campaign: campaign || 'newsletter',
    type: 'marketing',
  });

  return { mjml: mjmlString, html, template: templateName, errors: compiled.errors || [] };
}

module.exports = { renderNewsletter };
