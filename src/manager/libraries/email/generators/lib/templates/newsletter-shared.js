/**
 * Shared building blocks for newsletter templates.
 *
 * Architecture (rev 2):
 *
 *   shell({ ...envelope }, { header, hero, body, signoff, extraStyles, extraAttributes })
 *
 * The shell is OPINIONATED — it always renders the cross-cutting concerns
 * (top sponsorships, middle sponsorships, end sponsorships, citations, footer
 * with CAN-SPAM address) automatically from the envelope object. Templates
 * physically cannot forget them.
 *
 * Templates only own:
 *   - header: brand wordmark / masthead / whatever sits above the body
 *   - hero:   optional cover treatment (subject as headline + eyebrow, etc.)
 *   - body:   the section content — the main editorial
 *   - signoff: the closing sign-off ("Best, the Team")
 *   - extraStyles / extraAttributes: per-template CSS + mj-attributes overrides
 *
 * Everything else lives here and is rendered in a fixed, predictable order so
 * any new template gets working citations + sponsorships + footer-with-address
 * for free.
 *
 * Theme tokens:
 *   theme.spacing.gutter      — horizontal padding inside the card (default 32px)
 *   theme.spacing.sectionGap  — vertical gap between sections (default 24px)
 *   theme.spacing.ruleColor   — hairline divider color (default #e8e8ec)
 *   theme.primaryColor, secondaryColor, accentColor, font — the usual
 *
 * Templates may override theme.spacing per-build for their own look.
 */
const MarkdownIt = require('markdown-it');

const md = new MarkdownIt({ html: false, breaks: true, linkify: true });

// ---------- Default tokens ----------

const DEFAULT_SPACING = {
  gutter: '32px',
  sectionGap: '24px',
  ruleColor: '#e8e8ec',
};

// ---------- HTML / markdown helpers ----------

function markdownToHtml(markdown) {
  if (!markdown) {
    return '';
  }

  return md.render(markdown).replace(/\n+$/, '');
}

function escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render markdown then strip the surrounding <p> tags so it can be dropped
 * inside another paragraph-styled element (e.g. <mj-text> already has
 * paragraph styling).
 */
function inlineMarkdown(markdown) {
  return markdownToHtml(markdown)
    .replace(/^<p>/, '')
    .replace(/<\/p>$/, '');
}

// ---------- Address formatting (CAN-SPAM) ----------

/**
 * Format a structured address object into a single comma-separated line.
 * Accepts either a string (returned as-is) or an object:
 *   { line1, line2?, city, region?, postalCode?, country }
 *
 * Returns '' for falsy/empty input. All fields except line1 are optional —
 * the formatter just omits missing pieces.
 */
function formatAddress(address) {
  if (!address) {
    return '';
  }

  if (typeof address === 'string') {
    return address;
  }

  const parts = [];

  if (address.line1) parts.push(address.line1);
  if (address.line2) parts.push(address.line2);

  // City + region + postal go together: "Redondo Beach, CA 90278"
  const cityLine = [
    address.city,
    [address.region, address.postalCode].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');

  if (cityLine) parts.push(cityLine);
  if (address.country) parts.push(address.country);

  return parts.join(', ');
}

// ---------- Theme resolution ----------

/**
 * Merge a template's theme with the default spacing tokens. Templates can
 * override per-build (e.g. editorial uses a 48px gutter).
 */
function resolveTheme(theme, overrides) {
  return {
    ...theme,
    spacing: {
      ...DEFAULT_SPACING,
      ...(theme?.spacing || {}),
      ...(overrides || {}),
    },
  };
}

// ---------- Top-level shell (opinionated envelope) ----------

/**
 * Render the complete <mjml> document. Always includes the cross-cutting
 * concerns (sponsorships, citations, footer) — templates can't forget them.
 *
 * @param {object} envelope - data common to every newsletter
 * @param {object} envelope.structure - {subject, preheader, citations}
 * @param {object} envelope.theme
 * @param {string} envelope.brandName
 * @param {string} envelope.brandUrl
 * @param {string} envelope.brandAddress - formatted address string (or empty)
 * @param {Array}  envelope.sponsorships
 * @param {Date}   [envelope.now]
 *
 * @param {object} slots - template-provided content
 * @param {string} [slots.header]  - brand header / masthead HTML
 * @param {string} [slots.hero]    - optional cover headline / preamble HTML
 * @param {string} [slots.body]    - section content HTML (the main editorial)
 * @param {string} [slots.signoff] - closing sign-off HTML
 *
 * @param {object} [config] - template-specific shell configuration
 * @param {string} [config.width]                — body width (default 600px)
 * @param {string} [config.extraAttributes]      — extra <mj-attributes>
 * @param {string} [config.extraStyles]          — extra CSS for <mj-style>
 * @param {object} [config.sponsorshipStyle]     — passed to sponsorship rendering
 * @param {object} [config.citationsStyle]       — passed to citations rendering
 * @param {object} [config.footerStyle]          — passed to footer rendering
 */
function shell(envelope, slots, config) {
  const { structure, theme, brandName, brandUrl, brandAddress, sponsorships, now } = envelope;
  const { header = '', hero = '', body = '', signoff = '' } = slots || {};
  const cfg = config || {};

  const sponsorshipStyle = cfg.sponsorshipStyle || {};
  const citationsStyle   = cfg.citationsStyle   || {};
  const footerStyle      = cfg.footerStyle      || {};

  // The shell appends every cross-cutting concern in a fixed order.
  // Templates cannot skip these — they ALWAYS render if there's content for them.
  const compose = [
    header,
    hero,
    sponsorshipsAt({ sponsorships, position: 'top', theme, ...sponsorshipStyle }),
    body,
    sponsorshipsAt({ sponsorships, position: 'end', theme, ...sponsorshipStyle }),
    signoff,
    citationsBlock({ citations: structure.citations, theme, ...citationsStyle }),
    cfg.footerOverride || footerBlock({ brandName, brandUrl, theme, address: brandAddress, ...footerStyle }),
  ].filter(Boolean).join('\n');

  return `<mjml>
  <mj-head>
    <mj-title>${escape(structure.subject || brandName)}</mj-title>
    <mj-preview>${escape(structure.preheader || '')}</mj-preview>
    <mj-attributes>
      <mj-all font-family="${theme.font}" />
      <mj-text font-size="16px" line-height="1.6" color="${theme.secondaryColor}" />
      <mj-button background-color="${theme.primaryColor}" color="#ffffff" border-radius="6px" font-weight="600" inner-padding="14px 24px" padding="0" />
      <mj-section padding="0" />
      ${cfg.extraAttributes || ''}
    </mj-attributes>
    <mj-style>
      h1, h2, h3 { color: ${theme.secondaryColor}; margin: 0 0 12px; }
      h2 { font-size: 22px; line-height: 1.3; }
      a { color: ${theme.primaryColor}; }
      p { margin: 0 0 12px; }
      ${cfg.extraStyles || ''}
    </mj-style>
  </mj-head>
  <mj-body background-color="${theme.accentColor}" width="${cfg.width || '600px'}">
${compose}
  </mj-body>
</mjml>`;
}

// ---------- Section primitives ----------

/**
 * A raw <mj-section> with a single column. The most common shape — used
 * for text-only blocks (intro, signoff, footer).
 */
function singleColumnSection({ background, padding, content }) {
  return `
    <mj-section background-color="${background || '#ffffff'}" padding="${padding || '24px 32px'}">
      <mj-column>
        ${content}
      </mj-column>
    </mj-section>`;
}

/**
 * A <mj-section> with two side-by-side columns inside an <mj-group>. Used for
 * layouts like image+text, image+numeral, etc. Pass each column's content as
 * a complete `<mj-column>...</mj-column>` string, or use the `column()` helper.
 */
function twoColumnSection({ background, padding, left, right }) {
  return `
    <mj-section background-color="${background || '#ffffff'}" padding="${padding || '0 32px'}">
      <mj-group>
        ${left}
        ${right}
      </mj-group>
    </mj-section>`;
}

/**
 * Build a single <mj-column> with the given width + content.
 */
function column({ width, verticalAlign, content }) {
  return `<mj-column width="${width || '50%'}" vertical-align="${verticalAlign || 'middle'}">
          ${content}
        </mj-column>`;
}

/**
 * Plain text block. Markdown rendered. Optional inline style passthrough.
 */
function textBlock({ background, padding, markdown, html }) {
  const inner = html != null ? html : markdownToHtml(markdown || '');
  return singleColumnSection({
    background,
    padding,
    content: `<mj-text>${inner}</mj-text>`,
  });
}

/**
 * Hairline divider. Defaults to a faint grey rule on white.
 */
function dividerBlock({ background, padding, color, width }) {
  return singleColumnSection({
    background,
    padding,
    content: `<mj-divider border-color="${color || DEFAULT_SPACING.ruleColor}" border-width="${width || '1px'}" padding="0" />`,
  });
}

/**
 * Standard CTA button.
 */
function ctaBlock({ cta, padding, background, align }) {
  if (!cta?.label || !cta?.url) {
    return '';
  }

  return singleColumnSection({
    background,
    padding: padding || '16px 32px 0 32px',
    content: `<mj-button href="${escape(cta.url)}"${align ? ` align="${align}"` : ''}>${escape(cta.label)}</mj-button>`,
  });
}

/**
 * A standalone image, full-width within its section.
 */
function imageBlock({ src, alt, padding, background, borderRadius }) {
  if (!src) {
    return '';
  }

  return singleColumnSection({
    background,
    padding: padding || '0',
    content: `<mj-image src="${escape(src)}" alt="${escape(alt || '')}" padding="0"${borderRadius ? ` border-radius="${borderRadius}"` : ''} />`,
  });
}

// ---------- Whole-newsletter building blocks ----------

/**
 * Standard brand wordmark header. Brand name linked to brand URL, primary color.
 */
function brandHeader({ brandName, brandUrl, theme, padding, background }) {
  const gutter = theme?.spacing?.gutter || DEFAULT_SPACING.gutter;
  return singleColumnSection({
    background: background || '#ffffff',
    padding: padding || `32px ${gutter} 16px ${gutter}`,
    content: `<mj-text font-size="20px" font-weight="700" color="${theme.primaryColor}">
          <a href="${brandUrl}" style="color: ${theme.primaryColor}; text-decoration: none;">${escape(brandName)}</a>
        </mj-text>`,
  });
}

/**
 * Intro paragraph block. Pass a `decorate` function for templates that want
 * special treatment (e.g. drop-caps).
 */
function introBlock({ intro, theme, padding, background, decorate }) {
  if (!intro) {
    return '';
  }

  const gutter = theme?.spacing?.gutter || DEFAULT_SPACING.gutter;
  const html = decorate ? decorate(intro, theme) : markdownToHtml(intro);
  return textBlock({
    background: background || '#ffffff',
    padding: padding || `0 ${gutter} 24px ${gutter}`,
    html,
  });
}

/**
 * Default signoff block — simple italic line on white. Templates can override
 * by providing their own slots.signoff to shell().
 */
function signoffBlock({ signoff, theme, padding, background }) {
  if (!signoff) {
    return '';
  }

  const gutter = theme?.spacing?.gutter || DEFAULT_SPACING.gutter;
  const html = escape(signoff).replace(/\n/g, '<br/>');

  return singleColumnSection({
    background: background || '#ffffff',
    padding: padding || `32px ${gutter} 8px ${gutter}`,
    content: `<mj-text padding="0"><div style="color: ${theme.secondaryColor};">${html}</div></mj-text>`,
  });
}

/**
 * Standard footer. "You're receiving this..." + brand link + physical postal
 * address (CAN-SPAM compliance — the address is the load-bearing requirement;
 * the unsubscribe mechanism is provided by the sending platform).
 *
 * Unsubscribe handling: Beehiiv automatically appends its own CAN-SPAM-compliant
 * footer (with a working unsubscribe link tied to the subscriber's record) on
 * every email it sends. SendGrid does the same via list-unsubscribe headers
 * and template-level unsubscribe blocks. We do NOT render our own unsubscribe
 * link here because:
 *   1. It would point to ${brandUrl}/unsubscribe, which isn't wired to anything.
 *   2. Two unsubscribe links in the same email (ours + the platform's) is
 *      confusing and worse for compliance signal.
 *
 * Always renders. The shell calls this unconditionally.
 */
function footerBlock({ brandName, brandUrl, theme, padding, background, address, extraLine, topRule, linkStyle }) {
  const accent = background || theme.accentColor;
  const topRuleHtml = topRule || '';
  const extraLineHtml = extraLine ? `<div style="margin-bottom: 8px;">${escape(extraLine)}</div>` : '';
  const linkExtra = linkStyle ? ` ${linkStyle}` : '';
  const addressHtml = address ? `<br/><div style="margin-top: 10px; color: #aaa;">${escape(address)}</div>` : '';

  return `
    <mj-section background-color="${accent}" padding="${padding || '16px 32px 32px 32px'}">
      <mj-column>
        <mj-text font-size="12px" color="#888888" align="center">
          ${topRuleHtml}${extraLineHtml}You're receiving this because you subscribed to <a href="${brandUrl}" style="color: #888888;${linkExtra}">${escape(brandName)}</a>.
          ${addressHtml}
        </mj-text>
      </mj-column>
    </mj-section>`;
}

/**
 * Citations footnote block — renders an array of { note, source } as a
 * small numbered footer block at the bottom of the newsletter.
 * Renders nothing if citations is empty/missing. The shell calls this
 * unconditionally; the block self-suppresses when empty.
 */
function citationsBlock({ citations, theme, padding, background }) {
  if (!Array.isArray(citations) || !citations.length) {
    return '';
  }

  const gutter = theme?.spacing?.gutter || DEFAULT_SPACING.gutter;

  const items = citations.map((c, i) => `
          <div style="margin-bottom: 8px;">
            <span style="font-weight: 600; color: ${theme.primaryColor};">[${i + 1}]</span>
            <span style="color: ${theme.secondaryColor};"> ${escape(c.note)}</span>
            <span style="color: #888888;"> — ${escape(c.source)}</span>
          </div>`).join('');

  return singleColumnSection({
    background: background || '#ffffff',
    padding: padding || `24px ${gutter} 24px ${gutter}`,
    content: `<mj-text font-size="12px" line-height="1.5">
          <div style="font-size: 11px; letter-spacing: 4px; text-transform: uppercase; font-weight: 700; color: ${theme.primaryColor}; margin-bottom: 12px;">Sources &amp; data</div>
          ${items}
        </mj-text>`,
  });
}

/**
 * Sponsorship block — renders a single sponsorship promo blended into the
 * surrounding white card (no hard color break), with hairline rules above
 * and below to mark it as distinct content.
 */
function sponsorshipBlock({ sponsorship, theme, padding, background, label, withRules }) {
  if (!sponsorship?.url) {
    return '';
  }

  const surface = background || '#ffffff';
  const gutter = theme?.spacing?.gutter || DEFAULT_SPACING.gutter;
  const ruleColor = theme?.spacing?.ruleColor || DEFAULT_SPACING.ruleColor;
  const resolvedPadding = padding || `20px ${gutter} 20px ${gutter}`;

  const eyebrowText = sponsorship.eyebrowText || label || 'Sponsored';
  const image = sponsorship.image ? `
          <mj-image src="${escape(sponsorship.image)}" alt="${escape(sponsorship.headline || sponsorship.label || 'Sponsor')}" padding="0 0 12px 0" />` : '';
  const headline = sponsorship.headline ? `<h3 style="font-size: 18px; margin: 0 0 6px;">${escape(sponsorship.headline)}</h3>` : '';
  const body = sponsorship.body ? `<p style="font-size: 14px; color: #555; margin: 0;">${escape(sponsorship.body)}</p>` : '';
  const cta = sponsorship.ctaLabel || 'Learn more';

  const card = singleColumnSection({
    background: surface,
    padding: resolvedPadding,
    content: `${image}<mj-text padding="0">
          <div style="font-size: 11px; letter-spacing: 4px; text-transform: uppercase; font-weight: 700; color: ${theme.primaryColor}; margin-bottom: 10px;">${escape(eyebrowText)}</div>
          ${headline}
          ${body}
        </mj-text>
        <mj-button href="${escape(sponsorship.url)}" align="left" padding="14px 0 0 0">${escape(cta)}</mj-button>`,
  });

  if (withRules === false) {
    return card;
  }

  // Extract horizontal padding so dividers align with the card's gutter
  const paddingParts = resolvedPadding.split(/\s+/);
  const horizontalPadding = paddingParts.length >= 4
    ? `0 ${paddingParts[1]} 0 ${paddingParts[3]}`
    : `0 ${paddingParts[1] || gutter}`;

  const rule = dividerBlock({ background: surface, padding: horizontalPadding, color: ruleColor });

  return `${rule}\n${card}\n${rule}`;
}

/**
 * Render all sponsorships at a given position. Position matches the
 * sponsorship's `position` field — 'top', 'middle', or 'end'.
 * Sponsorships without an explicit position default to 'middle'.
 *
 * Note: 'middle' sponsorships are NOT rendered automatically by the shell —
 * templates that want them interleaved between sections must call this
 * themselves. 'top' and 'end' are always handled by the shell.
 */
function sponsorshipsAt({ sponsorships, position, theme, padding, background, label, withRules }) {
  if (!Array.isArray(sponsorships) || !sponsorships.length) {
    return '';
  }

  const matching = sponsorships.filter((s) => (s.position || 'middle') === position);

  if (!matching.length) {
    return '';
  }

  return matching
    .map((sponsorship) => sponsorshipBlock({ sponsorship, theme, padding, background, label, withRules }))
    .join('\n');
}

/**
 * A standard "card" section — image (optional) + title + body + cta inside
 * a single white section. Used by the `clean` template.
 */
function sectionCard({ section, imagePath, theme, padding, background, imageBorderRadius }) {
  const gutter = theme?.spacing?.gutter || DEFAULT_SPACING.gutter;
  const imageMjml = imagePath ? `
        <mj-image src="${escape(imagePath)}" alt="${escape(section.title)}" padding="0" border-radius="${imageBorderRadius || '8px 8px 0 0'}" />` : '';
  const ctaMjml = section.cta?.label && section.cta?.url ? `
        <mj-button href="${escape(section.cta.url)}" padding="16px 0 0 0">${escape(section.cta.label)}</mj-button>` : '';

  return `
    <mj-section background-color="${background || '#ffffff'}" padding="${padding || `24px ${gutter} 8px ${gutter}`}">
      <mj-column>${imageMjml}
        <mj-text padding="20px 0 0 0">
          <h2>${escape(section.title)}</h2>
          ${markdownToHtml(section.body || '')}
        </mj-text>${ctaMjml}
      </mj-column>
    </mj-section>`;
}

// ---------- Campaign/transactional blocks ----------

/**
 * Signoff block for campaign and transactional emails.
 * Handles structured signoff object: { type: 'team'|'personal', name, image, url, urlText }.
 * 'team' = "Best, The {Brand} Team". 'personal' = headshot + name + link.
 */
function transactionalSignoffBlock({ data, theme }) {
  const signoff = data?.signoff || {};
  const brandName = data?.brand?.name || '';
  const gutter = theme?.spacing?.gutter || DEFAULT_SPACING.gutter;

  if (signoff.type === 'personal' && signoff.name) {
    const imageMjml = signoff.image
      ? `<mj-image src="${escape(signoff.image)}" alt="${escape(signoff.name)}" width="60px" border-radius="50%" padding="0 0 12px 0" />`
      : '';
    const linkMjml = signoff.url
      ? `<br/><a href="${escape(signoff.url)}" style="color: ${theme.primaryColor}; font-size: 14px;">${escape(signoff.urlText || signoff.url)}</a>`
      : '';

    return singleColumnSection({
      background: '#ffffff',
      padding: `32px ${gutter} 16px ${gutter}`,
      content: `
        ${imageMjml}
        <mj-text padding="0">
          <div style="color: ${theme.secondaryColor};">
            Best,<br/><strong>${escape(signoff.name)}</strong>${linkMjml}
          </div>
        </mj-text>`,
    });
  }

  return singleColumnSection({
    background: '#ffffff',
    padding: `32px ${gutter} 16px ${gutter}`,
    content: `<mj-text padding="0"><div style="color: ${theme.secondaryColor};">Best,<br/>The ${escape(brandName)} Team</div></mj-text>`,
  });
}

/**
 * Footer block with SendGrid ASM unsubscribe tags.
 * Replaces footerBlock() for campaign/transactional emails.
 * ASM tags suppress SendGrid's auto-inserted ugly default unsubscribe text.
 */
function campaignFooterBlock({ data, theme, padding }) {
  const brandName = data?.brand?.name || '';
  const brandUrl = data?.brand?.url || '#';
  const address = formatAddress(data?.brand?.address);
  const addressHtml = address ? `<br/><div style="margin-top: 10px; color: #aaa;">${escape(address)}</div>` : '';

  // Custom unsubscribe URL (HMAC-signed portal link) or fallback to brand URL
  const unsubscribeUrl = data?.email?.unsubscribeUrl || `${brandUrl}/portal/email-preferences`;

  // Hidden ASM tags: prevents SendGrid from appending its own ugly default
  // "Unsubscribe From This List | Manage Email Preferences" text.
  // The _raw_url variants output just the URL (not a full <a> tag).
  const hiddenAsm = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    <a href="<%asm_group_unsubscribe_raw_url%>">unsubscribe</a>
    <a href="<%asm_preferences_raw_url%>">preferences</a>
  </div>`;

  return `
    <mj-section background-color="${theme.accentColor}" padding="${padding || '16px 32px 32px 32px'}">
      <mj-column>
        <mj-text font-size="12px" color="#888888" align="center">
          ${hiddenAsm}
          You're receiving this because you subscribed to <a href="${brandUrl}" style="color: #888888;">${escape(brandName)}</a>.
          <br/><a href="${unsubscribeUrl}" style="color: #888888;">Unsubscribe</a> | <a href="${unsubscribeUrl}" style="color: #888888;">Email Preferences</a>
          ${addressHtml}
        </mj-text>
      </mj-column>
    </mj-section>`;
}

module.exports = {
  // tokens
  DEFAULT_SPACING,
  // helpers
  markdownToHtml,
  escape,
  inlineMarkdown,
  formatAddress,
  resolveTheme,
  // top-level
  shell,
  // primitives
  singleColumnSection,
  twoColumnSection,
  column,
  textBlock,
  dividerBlock,
  ctaBlock,
  imageBlock,
  // composite blocks (templates can use directly OR ignore for custom versions)
  brandHeader,
  introBlock,
  signoffBlock,
  footerBlock,
  citationsBlock,
  sponsorshipBlock,
  sponsorshipsAt,
  sectionCard,
  // campaign/transactional
  transactionalSignoffBlock,
  campaignFooterBlock,
};
