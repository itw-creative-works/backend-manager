/**
 * `clean` template — Stripe / Linear marketing aesthetic.
 *
 * White cards on a light accent background. Brand wordmark header → intro →
 * one card per section (image, title, body, optional CTA) → signoff.
 *
 * The shell handles cross-cutting concerns (top/end sponsorships, citations,
 * footer with CAN-SPAM address) automatically. This file only owns the
 * "clean" identity — header, intro, section cards, signoff.
 */
const {
  shell,
  resolveTheme,
  brandHeader,
  introBlock,
  sectionCard,
  signoffBlock,
  sponsorshipsAt,
} = require('./shared.js');

const { CLASSIC_SCHEMA, normalizeClassic } = require('./classic-schema.js');

const SPACING_OVERRIDES = {
  gutter: '32px',
};

function build({ structure, imagePaths, theme: themeIn, brandName, brandUrl, brandAddress, now, sponsorships }) {
  const theme = resolveTheme(themeIn, SPACING_OVERRIDES);

  // Section rendering, with middle sponsorships interleaved at the midpoint.
  // Sections array is optional — a structure with no sections renders just
  // header + intro + signoff + footer (still a valid newsletter).
  const safeSections = Array.isArray(structure.sections) ? structure.sections : [];
  const sectionBlocks = safeSections.map((section, i) =>
    sectionCard({ section: section || {}, imagePath: imagePaths?.[i], theme })
  );

  const middleSponsorships = sponsorshipsAt({ sponsorships, position: 'middle', theme });
  if (middleSponsorships) {
    const middleIndex = Math.floor(sectionBlocks.length / 2);
    sectionBlocks.splice(middleIndex, 0, middleSponsorships);
  }

  // Envelope: shared data for every template
  const envelope = {
    structure,
    theme,
    brandName,
    brandUrl,
    brandAddress,
    sponsorships,
    now,
  };

  // Slots: what 'clean' uniquely contributes
  const slots = {
    header: brandHeader({ brandName, brandUrl, theme }),
    hero: introBlock({ intro: structure.intro, theme }),
    body: sectionBlocks.join('\n'),
    signoff: signoffBlock({ signoff: structure.signoff, theme }),
  };

  // Footer on transparent so it blends with the page background
  const config = {
    footerStyle: { background: 'transparent' },
  };

  return shell(envelope, slots, config);
}

module.exports = {
  build,
  meta: {
    name: 'clean',
    description: 'Stripe / Linear marketing aesthetic. Safe, conservative, works everywhere.',
    requires: ['subject', 'preheader', 'intro', 'sections', 'signoff'],
    optional: ['citations', 'image_prompt', 'cta'],
    supports: { sponsorships: ['top', 'middle', 'end'], citations: true, images: true },
  },
  schema: CLASSIC_SCHEMA,
  normalize: normalizeClassic,
};
