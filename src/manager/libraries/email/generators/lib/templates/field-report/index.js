/**
 * `field-report` template — wire-service correspondent × Bloomberg terminal.
 *
 * Each issue reads like a foreign correspondent's filing: an issue volume
 * strap, a TLDR terminal block under the masthead, then a series of
 * "dispatches" — each with a kicker, headline, byline, dateline, lede,
 * dispatch body, optional terminal-style data callout, and a fixed
 * "— END DISPATCH —" terminator.
 *
 * Aesthetic anchors (constant across brands, only ink color flexes):
 *   - Ivory paper background (off-white)
 *   - Black/oxblood ink for body text + serif headlines
 *   - Mono kickers and bylines (uppercase, tracked)
 *   - Terminal-style data blocks: black bg, phosphor green on black, red labels
 *   - Right-aligned correspondent's signoff ("— The X Desk")
 *
 * Content schema (template-owned — different from the classic schema):
 *   { tldr, dateline, dispatches: [{ kicker, headline, byline, location,
 *     lede, dispatch, dataPoints?, image_prompt }] }
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
  MONO_FONT,
  TERMINAL,
  DEFAULT_INK,
  kicker,
  issueStrap,
  dispatchDateline,
  dataCallout,
  tldrStrip,
  dispatchTerminator,
} = require('./helpers.js');

const { computeIssueNumber } = require('../editorial/helpers.js');

// Field-report-specific paper background — slight ivory tint, never pure white.
const PAPER = '#f7f3ec';
const PAPER_DEEP = '#efe9dc'; // for subtle bands / footer band

const SPACING_OVERRIDES = {
  gutter: '40px',
  sectionGap: '0px',
  ruleColor: '#1a1a1a', // ink rule, not the default light grey
};

function build({ structure, imagePaths, theme: themeIn, brandName, brandUrl, brandAddress, now, sponsorships }) {
  const theme = resolveTheme(themeIn, SPACING_OVERRIDES);
  const gutter = theme.spacing.gutter;
  const inkColor = theme.primaryColor || DEFAULT_INK;
  const dispatches = Array.isArray(structure.dispatches) ? structure.dispatches : [];

  // Build each dispatch block (no leading/trailing divider — orchestrator joins them).
  // Empty dispatches return '' which we filter so the inter-dispatch divider
  // doesn't end up double-stacking.
  const dispatchBlocks = dispatches.map((dispatch, i) =>
    fieldReportDispatch({
      dispatch,
      imagePath: imagePaths?.[i],
      theme,
      inkColor,
      brandName,
      now,
      index: i,
      total: dispatches.length,
    })
  ).filter(Boolean);

  // Middle sponsorships: insert at midpoint, without their own hairlines —
  // the inter-dispatch divider handles separation.
  const middleSponsorships = sponsorshipsAt({
    sponsorships,
    position: 'middle',
    theme,
    padding: `28px ${gutter} 28px ${gutter}`,
    background: PAPER,
    label: 'Underwritten by',
    withRules: false,
  });

  if (middleSponsorships) {
    const middleIndex = Math.floor(dispatchBlocks.length / 2);
    dispatchBlocks.splice(middleIndex, 0, middleSponsorships);
  }

  // Inter-dispatch divider — a wire-service "double rule" (two thin ink lines
  // with a small gap between them, evoking the typographic break that
  // separates filings in print wire reports). Lighter than a heavy 2px slab,
  // but more editorial-feeling than a single hairline.
  const interDispatchDivider = singleColumnSection({
    background: PAPER,
    padding: `40px ${gutter} 40px ${gutter}`,
    content: `<mj-text padding="0"><div style="border-top: 1px solid ${inkColor}; border-bottom: 1px solid ${inkColor}; height: 4px; line-height: 0; font-size: 0;">&nbsp;</div></mj-text>`,
  });

  const composedBody = dispatchBlocks.join(`\n${interDispatchDivider}\n`);

  // Envelope for the shell
  const envelope = {
    structure,
    theme,
    brandName,
    brandUrl,
    brandAddress,
    sponsorships,
    now,
  };

  const slots = {
    header: masthead({ brandName, brandUrl, theme, inkColor, now, dateline: structure.dateline, tagline: structure.preheader, gutter }),
    hero: tldrSection({ tldr: structure.tldr, gutter }),
    body: composedBody,
    signoff: correspondentSignoff({ signoff: structure.signoff, theme, inkColor, brandName, gutter }),
  };

  const config = {
    width: '660px',
    extraAttributes: `<mj-text font-family="${SERIF_FONT}" font-size="17px" line-height="1.65" color="#1a1a1a" />
      <mj-button background-color="transparent" color="${inkColor}" border-radius="0" font-weight="700" font-size="11px" letter-spacing="3px" inner-padding="14px 22px" text-transform="uppercase" padding="0" font-family="${MONO_FONT}" />`,
    extraStyles: fieldReportStyles({ inkColor }),
    sponsorshipStyle: {
      padding: `28px ${gutter} 28px ${gutter}`,
      background: PAPER,
      label: 'Underwritten by',
    },
    citationsStyle: {
      padding: `32px ${gutter} 32px ${gutter}`,
      background: PAPER,
    },
    footerStyle: {
      padding: `36px ${gutter} 48px ${gutter}`,
      background: PAPER_DEEP,
      topRule: `<div class="footer-stamp">FILED · ${escape(brandName).toUpperCase()}</div>`,
      extraLine: `VOL. ${computeIssueNumber(now || new Date())}`,
      linkStyle: 'border-bottom: none; font-family: ' + MONO_FONT + ';',
    },
  };

  return shell(envelope, slots, config);
}

// ---------- Field Report CSS ----------

function fieldReportStyles({ inkColor }) {
  return `
      body { background-color: ${PAPER}; }
      h1, h2, h3 { color: #1a1a1a; margin: 0; font-family: ${SERIF_FONT}; font-weight: 700; letter-spacing: -0.015em; }
      h1 { font-size: 56px; line-height: 1.0; }
      h2 { font-size: 38px; line-height: 1.05; }
      h3 { font-size: 14px; letter-spacing: 3px; text-transform: uppercase; font-weight: 700; font-family: ${MONO_FONT}; }
      a { color: ${inkColor}; text-decoration: none; border-bottom: 1px solid ${inkColor}; }
      p { margin: 0 0 16px; }
      .strap { font-family: ${MONO_FONT}; font-size: 10px; letter-spacing: 4px; color: rgba(0,0,0,0.55); text-transform: uppercase; }
      .masthead-rule { display: block; width: 100%; height: 3px; background: ${inkColor}; margin: 16px 0 18px; }
      .masthead-name { font-family: ${SERIF_FONT}; font-size: 64px; font-weight: 800; letter-spacing: -0.03em; line-height: 0.95; color: ${inkColor}; text-transform: uppercase; }
      .masthead-tagline { font-family: ${SERIF_FONT}; font-style: italic; font-size: 17px; color: rgba(0,0,0,0.75); line-height: 1.4; margin-top: 10px; }
      .lede { font-family: ${SERIF_FONT}; font-style: italic; font-size: 21px; line-height: 1.5; color: #1a1a1a; }
      .lede::first-letter { font-weight: 700; }
      .byline-row { font-family: ${MONO_FONT}; font-size: 10px; letter-spacing: 3px; color: rgba(0,0,0,0.6); text-transform: uppercase; margin-bottom: 4px; }
      .dispatch-body p { font-size: 17px; line-height: 1.7; color: #1a1a1a; margin: 0 0 16px; }
      /* Drop-cap reserved for the LEAD dispatch only — three drop-caps in a
         row reads as a quirk, not a feature. Subsequent dispatches get their
         visual entry point from the kicker + headline + ledes instead. */
      .dispatch-body.lead p:first-of-type::first-letter { font-family: ${SERIF_FONT}; font-weight: 700; font-size: 56px; line-height: 0.9; float: left; padding: 4px 12px 0 0; color: ${inkColor}; }
      .correspondent-signoff { font-family: ${SERIF_FONT}; font-style: italic; font-size: 16px; color: rgba(0,0,0,0.7); text-align: right; }
      .footer-stamp { font-family: ${MONO_FONT}; font-size: 10px; letter-spacing: 4px; color: ${inkColor}; margin-bottom: 14px; }
      .end-dispatch { text-align: center; font-family: ${MONO_FONT}; font-size: 10px; letter-spacing: 6px; color: ${inkColor}; }`;
}

// ---------- Field Report blocks ----------

function masthead({ brandName, brandUrl, theme, inkColor, now, dateline, tagline, gutter }) {
  const strap = issueStrap({ now, dateline });
  return singleColumnSection({
    background: PAPER,
    padding: `48px ${gutter} 36px ${gutter}`,
    content: `<mj-text padding="0">
          <div class="strap">${strap}</div>
          <div class="masthead-rule"></div>
          <div class="masthead-name"><a href="${brandUrl}" style="color: ${inkColor}; text-decoration: none; border-bottom: none;">${escape(brandName)}</a></div>
          ${tagline ? `<div class="masthead-tagline">${escape(tagline)}</div>` : ''}
        </mj-text>`,
  });
}

function tldrSection({ tldr, gutter }) {
  if (!tldr) {
    return '';
  }

  return singleColumnSection({
    background: PAPER,
    padding: `0 ${gutter} 0 ${gutter}`,
    content: `<mj-text padding="0">${tldrStrip({ tldr, gutter: '0' })}</mj-text>`,
  });
}

function fieldReportDispatch({ dispatch, imagePath, theme, inkColor, brandName, now, index, total }) {
  const gutter = theme.spacing.gutter;
  // Graceful omission: every piece below has a sensible fallback so missing
  // fields render an empty/omitted block rather than breaking the whole dispatch.
  const safeDispatch = dispatch || {};

  // A dispatch with no content at all renders nothing — caller handles the
  // resulting empty string in the join. Prevents a hollow "Dispatch N" stub.
  if (!safeDispatch.headline && !safeDispatch.dispatch && !safeDispatch.lede) {
    return '';
  }

  const kickerText = safeDispatch.kicker || (index === 0 ? 'LEAD DISPATCH' : 'DISPATCH');
  const headlineText = safeDispatch.headline || `Dispatch ${index + 1}`;
  const headlineHtml = `<h2>${escape(headlineText)}</h2>`;
  const dateline = dispatchDateline({ now, location: safeDispatch.location });
  const bylineText = safeDispatch.byline || `Filed by The ${brandName || ''} desk`.trim();
  const hasData = Array.isArray(safeDispatch.dataPoints) && safeDispatch.dataPoints.length > 0;

  // Header row: kicker + headline + byline. Always single-column, full-width.
  const headerRow = singleColumnSection({
    background: PAPER,
    padding: `40px ${gutter} 0 ${gutter}`,
    content: `<mj-text padding="0">
          ${kicker({ text: kickerText, color: inkColor })}
          <div style="height: 12px;"></div>
          ${headlineHtml}
          <div style="height: 16px;"></div>
          <div class="byline-row">${escape(bylineText)} &nbsp;·&nbsp; ${dateline}</div>
          <div style="height: 6px; border-bottom: 1px solid ${inkColor};"></div>
        </mj-text>`,
  });

  // Image row — full width below the header. No image = skip the row entirely.
  const imageRow = imagePath
    ? singleColumnSection({
      background: PAPER,
      padding: `24px ${gutter} 0 ${gutter}`,
      content: `<mj-image src="${escape(imagePath)}" alt="${escape(headlineText)}" padding="0" border-radius="0" />`,
    })
    : '';

  // Lede paragraph — italic serif, sets the tone. Omitted entirely when missing.
  const ledeRow = safeDispatch.lede
    ? singleColumnSection({
      background: PAPER,
      padding: `28px ${gutter} 0 ${gutter}`,
      content: `<mj-text padding="0"><div class="lede">${inlineMarkdown(safeDispatch.lede)}</div></mj-text>`,
    })
    : '';

  // Data callout — always rendered as a FULL-WIDTH terminal strip above the
  // body (when dataPoints are present). Earlier versions tried to columnify
  // body + data side-by-side, but at 660px that cramps both. A full-width
  // strip gives the data more visual punch AND lets body prose use the full
  // reading column underneath.
  const dataRow = hasData
    ? singleColumnSection({
      background: PAPER,
      padding: `28px ${gutter} 0 ${gutter}`,
      content: `<mj-text padding="0">${dataCallout({ dataPoints: safeDispatch.dataPoints, fullWidth: true })}</mj-text>`,
    })
    : '';

  const bodyHtml = safeDispatch.dispatch ? markdownToHtml(safeDispatch.dispatch) : '';
  // Mark the lead dispatch so CSS can apply the drop-cap only to it (see
  // .dispatch-body.lead in fieldReportStyles).
  const bodyClass = index === 0 ? 'dispatch-body lead' : 'dispatch-body';
  const bodyRow = bodyHtml
    ? singleColumnSection({
      background: PAPER,
      padding: `28px ${gutter} 0 ${gutter}`,
      content: `<mj-text padding="0"><div class="${bodyClass}">${bodyHtml}</div></mj-text>`,
    })
    : '';

  // CTA — outlined ghost button, mono label, left-aligned. Omitted when missing.
  const ctaRow = safeDispatch.cta?.label && safeDispatch.cta?.url
    ? singleColumnSection({
      background: PAPER,
      padding: `24px ${gutter} 0 ${gutter}`,
      content: `<mj-text padding="0"><div style="display: inline-block; border: 1.5px solid ${inkColor}; padding: 14px 24px;"><a href="${escape(safeDispatch.cta.url)}" style="font-family: ${MONO_FONT}; font-size: 11px; letter-spacing: 3px; font-weight: 700; text-transform: uppercase; color: ${inkColor}; text-decoration: none; border-bottom: none;">${escape(safeDispatch.cta.label)} &nbsp;→</a></div></mj-text>`,
    })
    : '';

  // Terminator row — small "— END DISPATCH —" mono marker.
  const terminatorRow = singleColumnSection({
    background: PAPER,
    padding: `32px ${gutter} 0 ${gutter}`,
    content: `<mj-text padding="0">${dispatchTerminator({ inkColor })}</mj-text>`,
  });

  return [headerRow, imageRow, ledeRow, dataRow, bodyRow, ctaRow, terminatorRow]
    .filter(Boolean)
    .join('\n');
}

function correspondentSignoff({ signoff, theme, inkColor, brandName, gutter }) {
  if (!signoff) {
    return '';
  }

  // Field Report renders the signoff as a right-aligned italic line, like a
  // correspondent signing off a dispatch with their desk name. The classic
  // "Best,\nThe X Team" still works — we render both lines, just italic and
  // right-aligned.
  const html = escape(signoff).replace(/\n/g, '<br/>');

  return singleColumnSection({
    background: PAPER,
    padding: `48px ${gutter} 16px ${gutter}`,
    content: `<mj-text padding="0"><div class="correspondent-signoff">${html}</div></mj-text>`,
  });
}

// ---------- Schema + AI prompt (template-owned content contract) ----------

const FIELD_REPORT_SCHEMA = {
  required: ['tldr', 'dateline', 'dispatches'],
  properties: {
    // Global to the issue
    tldr:     { type: 'string', maxLength: 400 },  // 2-sentence executive summary
    dateline: { type: 'string', maxLength: 60 },   // "LOS ANGELES" / "REMOTE" / "NEW YORK"
    dispatches: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kicker', 'headline', 'byline', 'location', 'lede', 'dispatch', 'image_prompt', 'dataPoints'],
        properties: {
          kicker:   { type: 'string', maxLength: 30 },  // "DISPATCH" / "FIELD NOTES" / "WATCH" / "BRIEF"
          headline: { type: 'string', maxLength: 90 },  // Tight, declarative
          byline:   { type: 'string', maxLength: 60 },  // "Filed by the growth desk"
          location: { type: 'string', maxLength: 30 },  // "REMOTE" / "OAKLAND"
          lede:     { type: 'string', maxLength: 220 }, // First-paragraph hook, present tense
          dispatch: { type: 'string' },                  // Main body markdown
          dataPoints: {
            type: 'array',
            maxItems: 4,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'value'],
              properties: {
                label: { type: 'string', maxLength: 22 },  // "USERS REACHED"
                value: { type: 'string', maxLength: 16 }, // "12.4K" / "+38%" / "$2.1M"
              },
            },
          },
          // CTAs intentionally not part of the contract — the AI cannot author URLs
          // reliably (no source URLs available, no brand-site knowledge). Newsletters
          // are self-contained; outbound links come from sponsorship blocks rendered
          // by the template shell, not from generated dispatch bodies.
          image_prompt: { type: 'string' },
        },
      },
    },
  },
};

function normalizeFieldReport(structure, { brand } = {}) {
  structure.tldr     = structure.tldr     || '';
  structure.dateline = structure.dateline || 'REMOTE';

  if (!Array.isArray(structure.dispatches)) {
    structure.dispatches = [];
  }

  structure.dispatches = structure.dispatches.map((d, i) => ({
    kicker:       d.kicker      || (i === 0 ? 'LEAD DISPATCH' : 'DISPATCH'),
    headline:     d.headline    || `Dispatch ${i + 1}`,
    byline:       d.byline      || `Filed by The ${brand?.name || 'editorial'} desk`,
    location:     d.location    || 'REMOTE',
    lede:         d.lede        || '',
    dispatch:     d.dispatch    || '',
    dataPoints:   Array.isArray(d.dataPoints) ? d.dataPoints.slice(0, 4) : [],
    image_prompt: d.image_prompt || '',
  }));

  // Map dispatches -> sections so svg-illustrator (which iterates
  // structure.sections) keeps working unchanged. Each section is the
  // dispatch's image_prompt + a fallback title for alt text.
  structure.sections = structure.dispatches.map((d) => ({
    title:        d.headline,
    image_prompt: d.image_prompt,
  }));
}

function buildPrompt({ brand, newsletterConfig, sources }) {
  const tone = newsletterConfig?.tone || 'present-tense, observational, terse';
  const instructions = newsletterConfig?.instructions || '';
  const taglineLine     = brand?.tagline     ? `\nTagline: ${brand.tagline}`     : '';
  const descriptionLine = brand?.description ? `\nDescription: ${brand.description}` : '';
  const brandName       = brand?.name || 'the brand';

  const system = [
    `You are the editor of a wire-service-style newsletter for ${brandName}.${taglineLine}${descriptionLine}`,
    instructions ? `\nBrand instructions:\n${instructions}` : '',
    '',
    `Tone: ${tone}`,
    '',
    'STYLE — write like a foreign correspondent filing a dispatch:',
    '- Present tense. Observational. Terse, declarative sentences.',
    '- Avoid marketing language ("game-changer", "level up", "unlock", "secrets").',
    '- Avoid throat-clearing transitions ("In today\'s digital landscape...", "It\'s no secret that...").',
    '- Avoid second-person hype ("YOU need to know this!", "What this means for YOU").',
    '- Specifics over generalities. Name actors (LinkedIn, Apple, etc.), numbers, places.',
    '- No emojis. No exclamation points. No "guru" language.',
    '',
    'ATTRIBUTION RULES (CRITICAL):',
    '- NEVER name the source publication, newsletter, blog, or author in the dispatch body.',
    '  (Do NOT write "according to Morning Brew", "as reported by Forbes", etc.)',
    '- Treat sources as background research, not publications you are quoting.',
    '- Write each dispatch AS IF you reported it yourself — first-party voice.',
    '- Naming third-party PLATFORMS, products, or companies in the news (LinkedIn, YouTube, etc.) is fine.',
    '',
    'CITATIONS:',
    '- If you reference specific numbers, percentages, or direct quotes, add an entry to the `citations` array.',
    '- citations[].source must be a neutral attribution ("Per company beta data", "Industry research, Q2 2026") — never the source publication name.',
    '- Citations render as small footnotes at the bottom of the issue. If nothing is worth citing, return an empty array.',
    '',
    'CONTENT REQUIREMENTS:',
    '- subject: ≤60 chars, declarative, no clickbait. Reads like a wire-service headline.',
    '- preheader: ≤100 chars, complements subject.',
    '- summary: 2-3 sentences, plain text, no markdown. An editorial recap of the whole issue (distinct from the in-template `tldr` strip — the summary is consumed by external surfaces like the share preview / summary.md file).',
    '- tags: 3-5 topical tags. Lowercase, kebab-case, no spaces. Examples: "linkedin", "creator-economy", "platform-policy". Empty array OK if nothing fits cleanly.',
    '- tldr: 2 short sentences max, ~200 chars total. Present tense. Reads like a terminal briefing — what changed, why it matters.',
    '- dateline: one city or "REMOTE" — sets where the issue is filed from. UPPERCASE. Example: "LOS ANGELES" / "REMOTE" / "NEW YORK".',
    '- dispatches: 3-5 items, each is a discrete filed story.',
    '  - kicker: a single uppercase mono label like "DISPATCH", "FIELD NOTES", "WATCH", "BRIEF", "READOUT", "BULLETIN". Pick the best fit.',
    '  - headline: tight, declarative, ≤90 chars. NOT a question. NOT a list. NOT clickbait.',
    `  - byline: short attribution line like "Filed by The ${brandName} growth desk" or "Filed by The ${brandName} platform desk". Be specific to the topic.`,
    '  - location: one of "REMOTE" / "NEW YORK" / "SAN FRANCISCO" / "LONDON" / "OAKLAND" / "AUSTIN" / etc. UPPERCASE. Match the subject when plausible.',
    '  - lede: one paragraph (1-2 sentences), italic-serif quality, sets the scene in present tense. Reads like the opening of a New Yorker article.',
    '  - dispatch: the body. 90-160 words. Markdown allowed. Present tense. Specific. End with the practical implication for the reader.',
    '  - dataPoints: 2-4 short label/value pairs IF there are meaningful numbers in the topic. Example: [{label:"USERS REACHED",value:"12.4K"},{label:"WoW GROWTH",value:"+38%"}]. SKIP this (empty array) if the topic has no quantifiable data.',
    '  - image_prompt: one-sentence visual brief for an illustrator. Specific. Think editorial illustration, not stock photo.',
    '  - DO NOT invent CTAs, "read more" links, or any URLs anywhere in the dispatch. The dispatch must stand on its own without sending the reader off-property.',
    `- signoff: render as TWO LINES with a literal \\n between them. Format: a short closing phrase + the desk name. Examples:\n    "— Stay sharp,\\nThe ${brandName} Desk"\n    "— Until next dispatch,\\nThe ${brandName} Editorial Desk"\n  Do NOT write a summary, motto, or thematic sentence. This is a literal sign-off.`,
    '',
    'OUTPUT:',
    '- Respond with valid JSON only. No markdown fences. No preamble.',
  ].filter(Boolean).join('\n');

  const summaries = (sources || [])
    .map((s, i) => {
      const raw = s.source || {};
      const headline = s.ai?.headline || raw.subject || s.subject || `Topic ${i + 1}`;
      const summary = s.ai?.summary || '';
      const takeaways = (s.ai?.takeaways || []).join('; ');
      const rawContent = !summary && raw.content
        ? raw.content.slice(0, 1500)
        : '';

      return [
        `[Research ${i + 1}]`,
        `Topic: ${headline}`,
        summary ? `Summary: ${summary}` : '',
        takeaways ? `Key takeaways: ${takeaways}` : '',
        rawContent ? `Raw content (excerpt):\n${rawContent}` : '',
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');

  const user = `File a wire-service-style issue using the following research as background. Do not name or reference these research items — synthesize each topic into a dispatch as if you reported it yourself.\n\n${summaries}`;

  return { system, user };
}

module.exports = {
  build,
  meta: {
    name: 'field-report',
    description: 'Wire-service correspondent × Bloomberg terminal. Dispatch kickers, datelines, mono data callouts, end-of-dispatch terminators.',
    requires: ['subject', 'preheader', 'tldr', 'dateline', 'dispatches', 'signoff'],
    optional: ['citations', 'dataPoints', 'image_prompt'],
    supports: { sponsorships: ['top', 'middle', 'end'], citations: true, images: true },
  },
  schema: FIELD_REPORT_SCHEMA,
  normalize: normalizeFieldReport,
  buildPrompt,
};
