/**
 * Markdown renderer — deterministic, no AI cost. Walks the `structure` object
 * produced by structure.js and emits a markdown document suitable for pasting
 * into Beehiiv's block editor (one section per `## heading` block, so you can
 * drop ad blocks between dispatches).
 *
 * Why this exists:
 *   - The MJML-rendered HTML is one giant styled block. Pasting it into Beehiiv
 *     defeats the block editor — ads can't be inserted between sections.
 *   - Markdown gives Beehiiv (and any future provider) a clean per-section
 *     structure that maps to native blocks.
 *
 * Why programmatic, not AI:
 *   - Cost: zero. Layout never changes between issues for a given template.
 *   - Determinism: same `structure` → same markdown. Easy to test.
 *   - SSOT: the AI-authored `structure` is the source of truth; markdown and
 *     HTML are two views of the same data.
 *
 * Template-awareness:
 *   - `clean`/`editorial` use the classic shape (intro + sections[]).
 *   - `field-report` uses dispatches[] with kickers, bylines, dataPoints.
 *   - The renderer reads `structure._meta.template` (set by structure.js) to
 *     pick the body strategy; falls back to "classic sections" if absent.
 *
 * Sections render as standalone blocks so each can be pasted independently:
 *   - heading (## ...)
 *   - image (markdown ![alt](url) — only if image URL is present)
 *   - body
 *   - CTA as a markdown link on its own line
 *   - horizontal rule between sections (---)
 */

/**
 * Render a newsletter structure as markdown.
 *
 * @param {object} args
 * @param {object} args.structure - The output of generateStructure()
 * @param {object} [args.brand] - { name, url, id }
 * @param {string[]} [args.imagePaths] - Per-section image URLs (same order as sections/dispatches)
 * @param {Array<{position, html, image_url, link_url}>} [args.sponsorships] - Optional sponsorships
 * @returns {string} Markdown document
 */
function renderMarkdown({ structure, brand, imagePaths, sponsorships }) {
  if (!structure) {
    throw new Error('markdown-renderer: structure is required');
  }

  const template = structure._meta?.template || 'clean';
  const parts = [];

  // ----- Header -----
  if (structure.subject) {
    parts.push(`# ${structure.subject}`);
  }

  if (structure.preheader) {
    parts.push(`_${structure.preheader}_`);
  }

  // Field-report-only opener: TLDR strip + dateline
  if (template === 'field-report') {
    if (structure.dateline) {
      parts.push(`**${structure.dateline.toUpperCase()} —** _Filed today_`);
    }

    if (structure.tldr) {
      parts.push(`> **TL;DR** — ${structure.tldr}`);
    }
  }

  // Classic intro
  if (structure.intro) {
    parts.push(structure.intro);
  }

  // Top sponsorship (above sections)
  const topSponsorship = pickSponsorship(sponsorships, 'top');
  if (topSponsorship) {
    parts.push('---');
    parts.push(renderSponsorshipMarkdown(topSponsorship));
  }

  parts.push('---');

  // ----- Body -----
  const sections = getBodySections(structure, template);

  for (let i = 0; i < sections.length; i++) {
    const block = renderSection(sections[i], i, imagePaths, template);

    if (!block) {
      continue;
    }

    parts.push(block);
    parts.push('---');

    // Mid-section sponsorship (after the middle dispatch)
    const middleIdx = Math.floor(sections.length / 2);

    if (i === middleIdx - 1) {
      const midSponsorship = pickSponsorship(sponsorships, 'middle');

      if (midSponsorship) {
        parts.push(renderSponsorshipMarkdown(midSponsorship));
        parts.push('---');
      }
    }
  }

  // End sponsorship (above signoff)
  const endSponsorship = pickSponsorship(sponsorships, 'end');
  if (endSponsorship) {
    parts.push(renderSponsorshipMarkdown(endSponsorship));
    parts.push('---');
  }

  // ----- Footer -----
  if (structure.signoff) {
    // Signoffs are stored with literal "\n" — convert to a markdown line break.
    parts.push(structure.signoff.replace(/\n/g, '  \n'));
  }

  if (Array.isArray(structure.citations) && structure.citations.length) {
    parts.push('---');
    parts.push('## Notes');

    for (let i = 0; i < structure.citations.length; i++) {
      const c = structure.citations[i];

      if (!c?.note) {
        continue;
      }

      const src = c.source ? ` — _${c.source}_` : '';
      parts.push(`${i + 1}. ${c.note}${src}`);
    }
  }

  if (Array.isArray(structure.tags) && structure.tags.length) {
    parts.push(`_Tags: ${structure.tags.map((t) => `#${t}`).join(' ')}_`);
  }

  if (brand?.name && brand?.url) {
    parts.push(`---\n_You're receiving this because you subscribed to [${brand.name}](${brand.url})._`);
  }

  // Join with blank-line separators; collapse any accidental triple-newlines.
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/**
 * Extract the "body sections" — what we'll loop over to render as ## headings.
 * The shape depends on the template.
 */
function getBodySections(structure, template) {
  if (template === 'field-report' && Array.isArray(structure.dispatches)) {
    return structure.dispatches.map((d) => ({
      kind: 'dispatch',
      title: d.headline,
      kicker: d.kicker,
      byline: d.byline,
      location: d.location,
      lede: d.lede,
      body: d.dispatch,
      dataPoints: d.dataPoints,
      image_prompt: d.image_prompt,
      cta: d.cta,  // injected post-generation (e.g. linked-article "Read more")
    }));
  }

  // Classic shape (clean, editorial)
  if (Array.isArray(structure.sections)) {
    return structure.sections.map((s) => ({
      kind: 'section',
      title: s.title,
      body: s.body,
      image_prompt: s.image_prompt,
      cta: s.cta,  // injected post-generation (e.g. linked-article "Read more")
    }));
  }

  return [];
}

/**
 * Render a single section/dispatch as a self-contained markdown block.
 * Empty sections (no title and no body) return null so the caller can skip
 * them entirely — avoids "## undefined" stubs and dangling `---` dividers.
 */
function renderSection(section, idx, imagePaths, template) {
  if (!section?.title && !section?.body) {
    return null;
  }

  const lines = [];

  // Kicker prefix (field-report only)
  if (section.kicker) {
    lines.push(`**${section.kicker.toUpperCase()}**`);
  }

  if (section.title) {
    lines.push(`## ${section.title}`);
  }

  // Byline / location bar (field-report only)
  if (section.byline || section.location) {
    const parts = [];
    if (section.location) parts.push(`**${section.location.toUpperCase()}**`);
    if (section.byline) parts.push(`_${section.byline}_`);
    lines.push(parts.join(' — '));
  }

  // Image (if hosted)
  const imageUrl = imagePaths && imagePaths[idx];

  if (imageUrl && !imageUrl.startsWith('about:')) {
    const alt = section.image_prompt || section.title || `Section ${idx + 1}`;
    lines.push(`![${alt.replace(/[\[\]]/g, '')}](${imageUrl})`);
  }

  // Lede (field-report)
  if (section.lede) {
    lines.push(`_${section.lede}_`);
  }

  // Data points (field-report)
  if (Array.isArray(section.dataPoints) && section.dataPoints.length) {
    const rows = section.dataPoints
      .map((dp) => `| **${dp.label || ''}** | ${dp.value || ''} |`)
      .join('\n');
    lines.push(`| Metric | Value |\n|---|---|\n${rows}`);
  }

  // Body
  if (section.body) {
    lines.push(section.body);
  }

  // CTA (e.g. "Read the full article →") — injected by code post-generation,
  // never authored by the AI. The MJML template renders section.cta via
  // sectionCard; this is the markdown equivalent for the Beehiiv-paste view.
  if (section.cta?.url && section.cta?.label) {
    lines.push(`[${section.cta.label} →](${section.cta.url})`);
  }

  return lines.join('\n\n');
}

/**
 * Pick the first sponsorship matching the requested position. Position is
 * one of 'top' | 'middle' | 'end'. Returns null if no match.
 */
function pickSponsorship(sponsorships, position) {
  if (!Array.isArray(sponsorships) || !sponsorships.length) {
    return null;
  }

  return sponsorships.find((s) => (s?.position || 'top') === position) || null;
}

/**
 * Render a sponsorship as markdown. Sponsorships in the HTML template are
 * styled blocks; in markdown they're a simple "Sponsored by" callout with
 * optional image and link.
 */
function renderSponsorshipMarkdown(sp) {
  const lines = ['**Sponsored**'];

  if (sp.image_url && sp.link_url) {
    lines.push(`[![Sponsor](${sp.image_url})](${sp.link_url})`);
  } else if (sp.image_url) {
    lines.push(`![Sponsor](${sp.image_url})`);
  }

  if (sp.html) {
    // Strip HTML tags for the markdown view; keep the text.
    const text = String(sp.html).replace(/<[^>]+>/g, '').trim();
    if (text) {
      lines.push(text);
    }
  }

  if (sp.link_url) {
    lines.push(`**[Learn more →](${sp.link_url})**`);
  }

  return lines.join('\n\n');
}

module.exports = {
  renderMarkdown,
};
