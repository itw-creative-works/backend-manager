/**
 * `editorial` template — magazine-style with masthead, drop-cap intro,
 * numbered sections, alternating image layout, pull-quotes, plain signoff.
 *
 * The shell handles cross-cutting concerns (top/end sponsorships, citations,
 * footer with CAN-SPAM address) automatically. This file only owns the
 * editorial identity:
 *
 *   - Dark masthead with oversized wordmark + issue line + serif tagline
 *   - Cover headline ("In this issue" eyebrow + giant subject)
 *   - Drop-cap intro
 *   - Numbered section layout with alternating image/numeral columns
 *   - Pull-quote per section
 *   - Optional inline 'middle' sponsorships between sections
 *   - Plain italic-serif sign-off on white
 */
const {
  shell,
  resolveTheme,
  escape,
  markdownToHtml,
  inlineMarkdown,
  singleColumnSection,
  twoColumnSection,
  column,
  dividerBlock,
  sponsorshipsAt,
} = require('../newsletter-shared.js');

const {
  SERIF_FONT,
  eyebrow,
  pullQuoteFrom,
  stripSentence,
  issueLine,
} = require('./helpers.js');

const { CLASSIC_SCHEMA, normalizeClassic } = require('../classic-schema.js');

const SPACING_OVERRIDES = {
  gutter: '48px',
  sectionGap: '24px',
};

function build({ structure, imagePaths, theme: themeIn, brandName, brandUrl, brandAddress, now, sponsorships }) {
  const theme = resolveTheme(themeIn, SPACING_OVERRIDES);
  const gutter = theme.spacing.gutter;
  const WHITE = '#ffffff';
  const issue = issueLine({ now });

  // Section rendering — sections NEVER render their own trailing divider.
  // The build orchestrator inserts dividers BETWEEN blocks below, so we have
  // exactly one separator between any two adjacent blocks and zero stacking.
  // Sections array is optional — a structure with no sections renders just
  // masthead + cover + intro + signoff + footer.
  const safeSections = Array.isArray(structure.sections) ? structure.sections : [];
  const sectionBlocks = safeSections.map((section, i) =>
    editorialSection({
      section: section || {},
      imagePath: imagePaths?.[i],
      theme,
      index: i,
      total: safeSections.length,
    })
  ).filter(Boolean);

  // Middle sponsorships: insert at midpoint, WITHOUT the sponsorship's own
  // hairlines (the section divider above and below already separates content).
  const middleSponsorships = sponsorshipsAt({
    sponsorships,
    position: 'middle',
    theme,
    padding: `20px ${gutter} 20px ${gutter}`,
    background: WHITE,
    label: 'In partnership with',
    withRules: false,
  });

  if (middleSponsorships) {
    const middleIndex = Math.floor(sectionBlocks.length / 2);
    sectionBlocks.splice(middleIndex, 0, middleSponsorships);
  }

  // Join section blocks with a SINGLE shared divider between adjacent blocks.
  // The divider gets symmetric vertical padding (40px above + 40px below) so
  // the rule sits visually centered between the surrounding content. No
  // leading divider, no trailing divider, no stacking with sponsorship rules.
  const divider = dividerBlock({
    background: WHITE,
    padding: `40px ${gutter} 40px ${gutter}`,
    color: theme.spacing.ruleColor,
  });
  const composedBody = sectionBlocks.join(`\n${divider}\n`);

  // Envelope passed to shell (data — same for every template)
  const envelope = {
    structure,
    theme,
    brandName,
    brandUrl,
    brandAddress,
    sponsorships,
    now,
  };

  // Slots — what this template uniquely contributes
  const slots = {
    header: masthead({ brandName, brandUrl, theme, issue, tagline: structure.preheader, gutter }),
    hero: [
      coverHeadline({ subject: structure.subject, theme, gutter }),
      dividerBlock({ background: WHITE, padding: `32px ${gutter} 0 ${gutter}`, color: theme.secondaryColor }),
      dropCapIntro({ intro: structure.intro, gutter }),
    ].filter(Boolean).join('\n'),
    body: composedBody,
    signoff: editorialSignoff({ signoff: structure.signoff, theme, gutter }),
  };

  // Per-template shell config
  const config = {
    width: '640px',
    extraAttributes: `<mj-text font-size="17px" line-height="1.7" color="${theme.secondaryColor}" />
      <mj-button background-color="${theme.secondaryColor}" color="#ffffff" border-radius="0" font-weight="600" font-size="12px" letter-spacing="2px" inner-padding="16px 28px" text-transform="uppercase" padding="0" />`,
    extraStyles: editorialStyles(theme),
    sponsorshipStyle: {
      padding: `20px ${gutter} 20px ${gutter}`,
      background: WHITE,
      label: 'In partnership with',
    },
    citationsStyle: {
      padding: `24px ${gutter} 24px ${gutter}`,
      background: WHITE,
    },
    footerStyle: {
      padding: `36px ${gutter} 64px ${gutter}`,
      topRule: `<div class="footer-rule"></div>`,
      extraLine: `${brandName} · Issue ${issue.number}`,
      linkStyle: 'border-bottom: none;',
    },
  };

  return shell(envelope, slots, config);
}

// ---------- Editorial-specific CSS ----------

function editorialStyles(theme) {
  return `
      h1, h2, h3 { color: ${theme.secondaryColor}; margin: 0; font-weight: 700; letter-spacing: -0.01em; }
      h2 { font-size: 32px; line-height: 1.15; }
      h3 { font-size: 14px; letter-spacing: 3px; text-transform: uppercase; font-weight: 600; }
      a { color: ${theme.primaryColor}; text-decoration: none; border-bottom: 1px solid ${theme.primaryColor}; }
      p { margin: 0 0 16px; }
      .masthead-issue { font-family: ${SERIF_FONT}; font-style: italic; font-size: 14px; color: rgba(255,255,255,0.7); letter-spacing: 1px; }
      .masthead-brand { font-size: 44px; font-weight: 900; letter-spacing: -0.03em; line-height: 1; color: #ffffff; }
      .masthead-rule { display: block; width: 48px; height: 4px; background: ${theme.primaryColor}; margin: 18px 0 14px; }
      .masthead-tagline { font-family: ${SERIF_FONT}; font-style: italic; font-size: 16px; color: rgba(255,255,255,0.85); line-height: 1.5; }
      .lede { font-family: ${SERIF_FONT}; font-size: 22px; line-height: 1.5; color: ${theme.secondaryColor}; }
      .lede::first-letter {
        font-family: ${SERIF_FONT};
        font-weight: 700;
        font-size: 72px;
        line-height: 0.85;
        float: left;
        padding: 6px 12px 0 0;
        color: ${theme.primaryColor};
      }
      .numeral-fallback { font-family: ${SERIF_FONT}; font-size: 96px; line-height: 0.85; font-weight: 700; color: ${theme.primaryColor}; opacity: 0.18; }
      .pullquote { font-family: ${SERIF_FONT}; font-style: italic; font-size: 22px; line-height: 1.4; color: ${theme.primaryColor}; border-left: 3px solid ${theme.primaryColor}; padding: 4px 0 4px 20px; margin: 8px 0 16px; }
      .section-meta { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #888; font-weight: 600; }
      .signoff { font-family: ${SERIF_FONT}; font-style: italic; font-size: 18px; line-height: 1.5; color: ${theme.secondaryColor}; }
      .footer-rule { display: block; width: 32px; height: 2px; background: ${theme.primaryColor}; margin: 0 auto 16px; }`;
}

// ---------- Editorial blocks ----------

function masthead({ brandName, brandUrl, theme, issue, tagline }) {
  return singleColumnSection({
    background: theme.secondaryColor,
    padding: `48px 40px 40px 40px`,
    content: `<mj-text>
          <div class="masthead-issue">${escape(issue.line)}</div>
          <div class="masthead-rule"></div>
          <div class="masthead-brand"><a href="${brandUrl}" style="color: #ffffff; text-decoration: none; border-bottom: none;">${escape(brandName).toUpperCase()}</a></div>
          <div class="masthead-tagline">${escape(tagline || '')}</div>
        </mj-text>`,
  });
}

function coverHeadline({ subject, theme, gutter }) {
  return singleColumnSection({
    background: '#ffffff',
    padding: `48px ${gutter} 8px ${gutter}`,
    content: `<mj-text padding="0">${eyebrow({ text: 'In this issue', color: theme.primaryColor })}</mj-text>
        <mj-spacer height="14px" />
        <mj-text padding="0"><h2 style="font-size: 38px; line-height: 1.1;">${escape(subject || '')}</h2></mj-text>`,
  });
}

function dropCapIntro({ intro, gutter }) {
  if (!intro) {
    return '';
  }

  return singleColumnSection({
    background: '#ffffff',
    padding: `32px ${gutter} 40px ${gutter}`,
    content: `<mj-text padding="0"><div class="lede">${inlineMarkdown(intro)}</div></mj-text>`,
  });
}

function editorialSection({ section, imagePath, theme, index, total }) {
  const gutter = theme.spacing.gutter;
  const WHITE = '#ffffff';
  const safeSection = section || {};

  // Skip an entirely empty section — no title, no body — so the orchestrator's
  // shared divider doesn't sandwich a hollow numeral block between two real
  // sections.
  if (!safeSection.title && !safeSection.body && !safeSection.cta) {
    return '';
  }

  const num = String(index + 1).padStart(2, '0');
  const totalLabel = String(total).padStart(2, '0');
  const pullQuote = pullQuoteFrom(safeSection.body || '');
  const bodyHtml = stripSentence(safeSection.body || '', pullQuote);
  const imageOnLeft = index % 2 === 0;

  const imageColumn = column({
    width: '60%',
    content: `<mj-image src="${escape(imagePath || '')}" alt="${escape(safeSection.title || '')}" padding="0" border-radius="0" />`,
  });
  const numeralColumn = column({
    width: '40%',
    content: `<mj-text padding="20px"><div class="numeral-fallback" style="text-align: center;">${num}</div></mj-text>`,
  });

  const imageRow = imagePath
    ? twoColumnSection({
      background: WHITE,
      padding: `0 ${gutter} 0 ${gutter}`,
      left:  imageOnLeft ? imageColumn   : numeralColumn,
      right: imageOnLeft ? numeralColumn : imageColumn,
    })
    : singleColumnSection({
      background: WHITE,
      padding: `0 ${gutter} 0 ${gutter}`,
      content: `<mj-text><div class="numeral-fallback">${num}</div></mj-text>`,
    });

  const titleRow = safeSection.title
    ? singleColumnSection({
      background: WHITE,
      padding: `28px ${gutter} 0 ${gutter}`,
      content: `<mj-text padding="0"><div class="section-meta">Story ${num} of ${totalLabel}</div></mj-text>
        <mj-spacer height="10px" />
        <mj-text padding="0"><h2>${escape(safeSection.title)}</h2></mj-text>`,
    })
    : '';

  const pullQuoteRow = pullQuote
    ? singleColumnSection({
      background: WHITE,
      padding: `8px ${gutter} 0 ${gutter}`,
      content: `<mj-text padding="0"><div class="pullquote">${escape(pullQuote)}</div></mj-text>`,
    })
    : '';

  const bodyRow = bodyHtml
    ? singleColumnSection({
      background: WHITE,
      padding: `12px ${gutter} 24px ${gutter}`,
      content: `<mj-text padding="0">${markdownToHtml(bodyHtml)}</mj-text>`,
    })
    : '';

  const ctaRow = safeSection.cta?.label && safeSection.cta?.url
    ? singleColumnSection({
      background: WHITE,
      padding: `8px ${gutter} 0 ${gutter}`,
      content: `<mj-button href="${escape(safeSection.cta.url)}" align="left">${escape(safeSection.cta.label)} &nbsp;→</mj-button>`,
    })
    : '';

  // Section never renders its own trailing divider — the build orchestrator
  // joins adjacent sections with one shared divider so spacing is symmetric
  // and no rules stack against sponsorship hairlines. Falsy rows are filtered
  // so an empty/partial section doesn't emit hollow whitespace blocks.
  return [imageRow, titleRow, pullQuoteRow, bodyRow, ctaRow].filter(Boolean).join('\n');
}

function editorialSignoff({ signoff, theme, gutter }) {
  if (!signoff) {
    return '';
  }

  const html = escape(signoff).replace(/\n/g, '<br/>');

  return singleColumnSection({
    background: '#ffffff',
    padding: `40px ${gutter} 8px ${gutter}`,
    content: `<mj-text padding="0"><div class="signoff">${html}</div></mj-text>`,
  });
}

module.exports = {
  build,
  meta: {
    name: 'editorial',
    description: 'Magazine-style: masthead, drop-cap intro, numbered sections, pull-quotes, italic signoff.',
    requires: ['subject', 'preheader', 'intro', 'sections', 'signoff'],
    optional: ['citations', 'image_prompt'],
    supports: { sponsorships: ['top', 'middle', 'end'], citations: true, images: true },
  },
  schema: CLASSIC_SCHEMA,
  normalize: normalizeClassic,
};
