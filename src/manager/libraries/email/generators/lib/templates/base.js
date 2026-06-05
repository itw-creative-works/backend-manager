/**
 * Base building blocks for campaign/transactional email templates.
 *
 * skeleton() — the required wrapper. Every template uses this. Provides:
 *   <mjml>, <mj-head> (title, preview, font-family, styles), hidden ASM tags, close tags.
 *   The second arg is the body content — templates compose whatever they want inside.
 *
 * Everything else is an opt-in block — a function that returns an MJML string.
 * Templates import what they need and ignore the rest.
 */
const { escape } = require('./shared-campaign.js');

const PARENT_NAME = 'ITW Creative Works';
const PARENT_WORDMARK = 'https://cdn.itwcreativeworks.com/assets/itw-creative-works/images/logo/itw-creative-works-wordmark-black-1024x.png';

const DEFAULT_STYLES = `
  body { background-color: #F7FAFC; }
  h1, h2, h3 { color: #1A202C; margin: 0 0 12px; font-weight: 500; }
  h2 { font-size: 32px; line-height: 1.2; }
  a { color: #0d6efd; }
  p { margin: 0 0 12px; color: #4A5568; }
`;

// Hidden ASM tags — suppress SendGrid's auto-inserted unsubscribe text.
// _raw_url variants output just the URL, not a full <a> tag.
const HIDDEN_ASM = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    <a href="<%asm_group_unsubscribe_raw_url%>">unsubscribe</a>
    <a href="<%asm_preferences_raw_url%>">preferences</a>
  </div>`;

/**
 * The required skeleton — every template wraps its content in this.
 *
 * @param {object} options
 * @param {string} [options.subject] - Email subject (for <mj-title>)
 * @param {string} [options.preview] - Preheader text
 * @param {string} [options.styles] - Additional CSS (appended to defaults)
 * @param {string} [options.width] - Body width (default '600px')
 * @param {string[]} [options.categories] - Email categories for hidden tagging
 * @param {string} content - MJML body content
 * @returns {string} Complete MJML document
 */
function skeleton({ subject, preview, styles, width, categories }, content) {
  const categoryTags = (categories || [])
    .map(c => `category=${escape(c)}`)
    .join('\n                  ,\n                  ');
  const hiddenMeta = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${HIDDEN_ASM}
    ${categoryTags ? `<span>${categoryTags}</span>` : ''}
  </div>`;

  return `<mjml>
  <mj-head>
    <mj-title>${escape(subject || '')}</mj-title>
    <mj-preview>${escape(preview || '')}</mj-preview>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" color="#1A202C" />
      <mj-section padding="0" />
    </mj-attributes>
    <mj-style>${DEFAULT_STYLES}${styles || ''}</mj-style>
  </mj-head>
  <mj-body background-color="#F7FAFC" width="${width || '600px'}">
${content}
    <mj-section padding="0"><mj-column><mj-text padding="0">${hiddenMeta}</mj-text></mj-column></mj-section>
  </mj-body>
</mjml>`;
}

/**
 * Brandmark logo centered above the card.
 * Falls back to brand name text if no image.
 */
function logo(brand, theme) {
  const brandName = brand?.name || '';
  const brandUrl = brand?.url || '#';
  const logoUrl = brand?.images?.brandmark || '';
  const primaryColor = theme?.primaryColor || '#5B5BFF';

  const inner = logoUrl
    ? `<img src="${escape(logoUrl)}" alt="${escape(brandName)}" width="96" style="width: 96px; height: auto; display: inline-block;" />`
    : `<span style="font-size: 20px; font-weight: 700; color: ${primaryColor};">${escape(brandName)}</span>`;

  return `
    <mj-section padding="40px 0 0 0">
      <mj-column>
        <mj-text align="center" padding="0">
          <a href="${brandUrl}" style="text-decoration: none;">${inner}</a>
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="16px 0 0 0"><mj-column><mj-text>&nbsp;</mj-text></mj-column></mj-section>`;
}

/**
 * White card with border + rounded corners. Wraps content.
 */
function cardWrapper(content) {
  return `
    <mj-section padding="0 16px">
      <mj-column padding="40px" background-color="#ffffff" border="1px solid #E2E8F0" border-radius="16px">
        ${content}
      </mj-column>
    </mj-section>
    <mj-section padding="24px 0 0 0"><mj-column><mj-text>&nbsp;</mj-text></mj-column></mj-section>`;
}

/**
 * Signoff block — handles team vs personal (with headshot + link).
 */
function signoff(data, theme) {
  const s = data?.signoff || {};
  const brandName = data?.brand?.name || '';
  const primaryColor = theme?.primaryColor || '#5B5BFF';
  const isPersonal = s.type === 'personal' && s.name;

  if (isPersonal) {
    const img = s.image
      ? `<img src="${escape(s.image)}" alt="${escape(s.name)}" width="60" style="width: 60px; height: 60px; border-radius: 50%; display: block;" />`
      : '';
    const link = s.url
      ? `<br/><a href="${escape(s.url)}" style="color: ${primaryColor}; font-size: 14px; text-decoration: none;">${escape(s.urlText || s.url)}</a>`
      : '';

    const inner = img
      ? `<table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align: middle; padding-right: 16px;">${img}</td>
          <td style="vertical-align: middle; color: #4A5568;">Warm regards,<br/><strong>${escape(s.name)}</strong>${link}</td>
        </tr></table>`
      : `<div style="color: #4A5568;">Warm regards,<br/><strong>${escape(s.name)}</strong>${link}</div>`;

    return `
        <mj-divider border-color="#E2E8F0" border-width="1px" padding="32px 0 24px 0" />
        <mj-text padding="0">${inner}</mj-text>`;
  }

  return `
        <mj-divider border-color="#E2E8F0" border-width="1px" padding="32px 0 24px 0" />
        <mj-text padding="0"><div style="color: #4A5568;">Sincerely,<br/>The ${escape(brandName)} Team</div></mj-text>`;
}

/**
 * CTA button (dark style).
 */
function button(btn) {
  if (!btn?.url || !btn?.text) {
    return '';
  }

  return `<mj-button href="${escape(btn.url)}" background-color="#1A202C" color="#ffffff" border-radius="4px" font-size="16px" font-weight="normal" inner-padding="10px 20px" padding="24px 0 0 0">${escape(btn.text)}</mj-button>`;
}

/**
 * Full footer — ITW wordmark, footer text, divider, links, copyright, address.
 */
function footer(brand, email) {
  const brandUrl = brand?.url || '#';
  const addr = brand?.address || {};
  const address = [addr.line1, addr.line2, addr.city, addr.region, addr.postalCode].filter(Boolean).join(' · ');
  const footerText = email?.footer?.text || 'You are receiving this email because you recently interacted with our website.';
  const unsubscribeUrl = email?.unsubscribeUrl || `${brandUrl}/portal/email-preferences`;
  const year = new Date().getFullYear();

  return `
    <mj-section padding="0 32px">
      <mj-column>
        <mj-image src="${PARENT_WORDMARK}" alt="${escape(PARENT_NAME)}" width="160px" padding="0" />
      </mj-column>
    </mj-section>

    <mj-section padding="8px 32px 0 32px">
      <mj-column>
        <mj-text align="center" font-size="14px" color="#718096" padding="0">
          ${escape(footerText)}
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section padding="16px 32px">
      <mj-column>
        <mj-divider border-color="#E2E8F0" border-width="1px" padding="0" />
      </mj-column>
    </mj-section>

    <mj-section padding="0 32px">
      <mj-column>
        <mj-text align="center" font-size="13px" color="#718096" padding="0">
          <a href="${brandUrl}/account" style="color: #718096; text-decoration: underline;">Manage account</a> &middot;
          <a href="${brandUrl}/terms" style="color: #718096; text-decoration: underline;">Terms</a> &middot;
          <a href="${brandUrl}/privacy" style="color: #718096; text-decoration: underline;">Privacy</a> &middot;
          <a href="${unsubscribeUrl}" style="color: #718096; text-decoration: underline;">Unsubscribe</a>
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section padding="4px 32px 0 32px">
      <mj-column>
        <mj-text align="center" font-size="13px" color="#A0AEC0" padding="0">
          &copy; ${year} ${escape(PARENT_NAME)}
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section padding="2px 32px 32px 32px">
      <mj-column>
        <mj-text align="center" font-size="13px" color="#A0AEC0" padding="0">
          ${escape(address)}
        </mj-text>
      </mj-column>
    </mj-section>`;
}

module.exports = {
  skeleton,
  logo,
  cardWrapper,
  signoff,
  button,
  footer,
  escape,
  HIDDEN_ASM,
  PARENT_NAME,
  PARENT_WORDMARK,
};
