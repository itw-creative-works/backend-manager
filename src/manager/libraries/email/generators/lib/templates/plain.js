/**
 * Plain template — looks like a regular email from a person.
 * No logo, no card, no branding. Full-width MJML body so it doesn't center in a narrow column.
 */
const { escape } = require('./shared-campaign.js');

function build({ data }) {
  const brand = data?.brand || {};
  const brandName = brand.name || '';
  const brandUrl = brand.url || '#';
  const email = data?.email || {};
  const content = data?.content || {};
  const signoffData = data?.signoff || {};
  const name = data?.personalization?.name;

  const unsubscribeUrl = email.unsubscribeUrl || `${brandUrl}/portal/email-preferences`;
  const addr = brand.address || {};
  const address = [addr.line1, addr.line2, addr.city, addr.region, addr.postalCode].filter(Boolean).join(' &middot; ');

  // Greeting
  const greeting = content.greeting
    ? `<p>${escape(content.greeting)}${name ? ` ${escape(name)}` : ''},</p>`
    : '';

  // Message
  const message = content.message || '';

  // Optional link
  const link = content.link?.url
    ? `<p><a href="${escape(content.link.url)}" style="color: #1a73e8;">${escape(content.link.text || content.link.url)}</a></p>`
    : '';

  // Signoff
  const signoffGreeting = content.signoff || 'Best';
  const signoffName = signoffData.name
    || (signoffData.type === 'personal' ? 'Ian Wiedenman, CEO' : `The ${brandName} Team`);

  // Hidden tags
  const hiddenAsm = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;"><a href="<%asm_group_unsubscribe_raw_url%>">unsubscribe</a><a href="<%asm_preferences_raw_url%>">preferences</a></div>`;

  const categoryTags = (email.categories || []).map(c => `category=${escape(c)}`).join(', ');
  const hiddenMeta = categoryTags
    ? `<span style="display:none;">${categoryTags}</span>`
    : '';

  return `<mjml>
  <mj-head>
    <mj-title>${escape(email.subject || '')}</mj-title>
    <mj-preview>${escape(email.preview || '')}</mj-preview>
    <mj-attributes>
      <mj-all font-family="Arial, Helvetica, sans-serif" />
      <mj-text font-size="14px" line-height="1.6" color="#222222" padding="0" />
      <mj-section padding="0" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#ffffff" width="100%">

    <mj-section>
      <mj-column>
        <mj-text>${greeting}${message}${link}</mj-text>
        <mj-text padding="12px 0 0 0"><p>${escape(signoffGreeting)},<br>${escape(signoffName)}</p></mj-text>
        <mj-text padding="24px 0 0 0" font-size="11px" color="#aaaaaa">
          <a href="${escape(unsubscribeUrl)}" style="color:#aaaaaa;">Unsubscribe</a> &middot;
          <a href="${brandUrl}/account" style="color:#aaaaaa;">Manage account</a> &middot;
          ${address}
          ${hiddenAsm}
          ${hiddenMeta}
        </mj-text>
      </mj-column>
    </mj-section>

  </mj-body>
</mjml>`;
}

const meta = {
  name: 'plain',
  description: 'Plain personal email — no branding, just text + required footer',
};

module.exports = { build, meta };
