/**
 * Shared email preparation — normalizes inputs for both transactional and marketing paths.
 *
 * Both paths need the same "email envelope": brand (with sanitized images), sender (from + ASM group),
 * content (markdown→HTML or pre-rendered HTML), signoff defaults, categories, and unsubscribe URL.
 * This module builds that envelope once so the callers just do their path-specific work
 * (transactional: recipients + SendGrid Mail Send; marketing: audience targeting + Single Send).
 *
 * Used by: transactional/index.js, marketing/index.js
 */
const _ = require('lodash');
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt({ html: true, breaks: true, linkify: true });

const {
  GROUPS,
  SENDERS,
  sanitizeImagesForEmail,
  encode,
  errorWithCode,
} = require('./constants.js');
const { tagLinks } = require('./utm.js');
const { renderEmail } = require('./generators/lib/mjml-template.js');

/**
 * Resolve brand data with email-safe images (SVG→PNG).
 *
 * @param {object} Manager
 * @returns {{ brand: object, brandDomain: string }}
 */
function resolveBrand(Manager) {
  const raw = Manager.config?.brand;

  if (!raw) {
    throw errorWithCode('Missing brand configuration in backend-manager-config.json', 400);
  }

  const brand = _.cloneDeep(raw);
  brand.images = sanitizeImagesForEmail(brand.images || {});

  if (!brand.contact?.email) {
    throw errorWithCode('Missing brand.contact.email in backend-manager-config.json', 400);
  }

  const brandDomain = brand.contact.email.split('@')[1];

  return { brand, brandDomain };
}

/**
 * Resolve sender (from address + ASM group) from a sender category key.
 *
 * @param {object} options
 * @param {string} [options.sender] - Sender category key ('orders', 'hello', 'marketing', etc.)
 * @param {object} [options.from] - Explicit from override
 * @param {number|string} [options.group] - Explicit ASM group override
 * @param {object} brand - Resolved brand object
 * @param {string} brandDomain - Brand email domain
 * @returns {{ from: object, groupId: number }}
 */
function resolveSender({ sender, from, group }, brand, brandDomain) {
  const senderConfig = SENDERS[sender] || null;

  const resolvedFrom = from
    || (senderConfig && {
      email: `${senderConfig.localPart}@${brandDomain}`,
      name: senderConfig.displayName.replace('{brand}', brand.name || ''),
    })
    || { email: brand.contact.email, name: brand.name };

  const groupId = group != null
    ? (GROUPS[group] || group)
    : (senderConfig ? senderConfig.group : GROUPS['account']);

  return { from: resolvedFrom, groupId };
}

/**
 * Render content to HTML. Accepts markdown OR pre-rendered HTML.
 * Applies UTM link tagging to the result.
 *
 * @param {object} options
 * @param {string} [options.content] - Markdown content
 * @param {string} [options.html] - Pre-rendered HTML (skips markdown)
 * @param {object} utmOptions - UTM tagging options
 * @returns {string} Email-safe HTML
 */
function renderContent({ content, html }, utmOptions) {
  let rendered = html || '';

  if (!rendered && content) {
    rendered = md.render(content);
  }

  if (rendered && utmOptions) {
    rendered = tagLinks(rendered, utmOptions);
  }

  return rendered;
}

/**
 * Build signoff defaults. Fills in personal signoff details when type is 'personal'.
 *
 * @param {object} [signoff] - Caller-provided signoff (or empty)
 * @returns {object} Complete signoff object
 */
function resolveSignoff(signoff) {
  const resolved = { type: 'team', ...signoff };

  if (resolved.type === 'personal') {
    resolved.image = resolved.image
      || 'https://cdn.itwcreativeworks.com/assets/ian-wiedenman/images/website/ian-wiedenman-headshot-2021-color-1024x1024.jpg';
    resolved.name = resolved.name || 'Ian Wiedenman, CEO';
    resolved.url = resolved.url || 'https://ianwiedenman.com';
    resolved.urlText = resolved.urlText || '@ianwieds';
  }

  return resolved;
}

/**
 * Build categories array with type prefix + brand ID.
 *
 * @param {string} type - 'transactional' or 'marketing'
 * @param {string} brandId
 * @param {string[]} [extra] - Additional categories from caller
 * @returns {string[]}
 */
function buildCategories(type, brandId, extra) {
  const powertools = require('node-powertools');

  return _.uniq([
    type,
    brandId,
    ...powertools.arrayify(extra),
  ].filter(Boolean));
}

/**
 * Build an HMAC-signed unsubscribe URL for transactional emails.
 *
 * @param {object} options
 * @param {string} options.email - Recipient email
 * @param {number} options.groupId - ASM group ID
 * @param {string} options.template - Template name
 * @param {string} options.websiteUrl - Brand website URL
 * @returns {string}
 */
function buildUnsubscribeUrl({ email, groupId, template, websiteUrl }) {
  const crypto = require('crypto');
  const sig = crypto.createHmac('sha256', process.env.UNSUBSCRIBE_HMAC_KEY)
    .update(email.toLowerCase())
    .digest('hex');

  return `${websiteUrl}/portal/email-preferences?email=${encode(email)}&asmId=${encode(groupId)}&template=${encode(template)}&sig=${sig}`;
}

/**
 * Build the full template data tree for MJML rendering.
 * Merges system defaults (brand, signoff, email metadata) with caller-provided data.
 *
 * @param {object} options
 * @param {object} options.brand - Resolved brand object
 * @param {string} options.subject
 * @param {string} [options.preview] - Preheader text
 * @param {string} [options.contentHtml] - Rendered HTML body
 * @param {object} [options.signoff] - Resolved signoff
 * @param {string} [options.unsubscribeUrl]
 * @param {string[]} [options.categories]
 * @param {boolean} [options.copy] - Whether this email is carbon-copied
 * @param {object} [options.callerData] - Additional data from the caller (order, user, etc.)
 * @returns {object} Complete template data tree
 */
function buildTemplateData({
  brand,
  subject,
  preview,
  contentHtml,
  signoff,
  unsubscribeUrl,
  categories,
  copy,
  callerData,
}) {
  const uuid = require('uuid');

  const defaults = {
    email: {
      id: uuid.v4(),
      subject,
      preview: preview || null,
      unsubscribeUrl: unsubscribeUrl || `${brand.url}/portal/email-preferences`,
      categories,
      footer: { text: null },
      carbonCopy: copy ?? true,
    },
    signoff,
    brand,
  };

  // Deep-merge caller data on top of defaults.
  // Callers can override any field and add custom data (order, body, user, etc.).
  if (callerData) {
    _.merge(defaults, callerData);
  }

  // Inject rendered HTML into content.message. When contentHtml is provided, it
  // replaces whatever the caller had in content.message (the raw markdown was
  // already consumed by renderContent() to produce this HTML).
  if (contentHtml) {
    _.set(defaults, 'content.message', contentHtml);
  }

  return defaults;
}

/**
 * Render template data through MJML and return compiled HTML.
 *
 * @param {object} options
 * @param {object} options.brand - Resolved brand
 * @param {string} options.template - Template name ('card', 'plain', 'order', etc.)
 * @param {object} options.data - Complete template data tree
 * @param {object} [options.utm] - UTM overrides for link tagging ({ campaign, type })
 * @returns {Promise<{ html: string, mjml: string, errors: object[] }>}
 */
async function render({ brand, template, data, utm }) {
  return renderEmail({ brand, template: template || 'card', data, utm });
}

module.exports = {
  resolveBrand,
  resolveSender,
  renderContent,
  resolveSignoff,
  buildCategories,
  buildUnsubscribeUrl,
  buildTemplateData,
  render,
};
