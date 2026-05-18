/**
 * Classic newsletter content schema — used by `clean` and `editorial`.
 *
 * Both templates consume the same shape:
 *   - intro: 1-2 sentence preamble
 *   - sections: list of {title, body, image_prompt}
 *
 * Defined here so adding a new field (e.g. an eyebrow per section) updates
 * every classic-style template at once. Templates with fundamentally
 * different content shapes (Field Report, Postcard, Almanac) declare their
 * own schema instead.
 *
 * NOTE: CTAs / outbound links are intentionally NOT part of the schema. The
 * AI cannot reliably author URLs without inventing them (it can't browse the
 * brand's site and has no real source URLs), so we forbid the field entirely.
 * Newsletters are self-contained — link out from the rendered HTML manually
 * (sponsorship blocks, footer) rather than from generated section bodies.
 */
const CLASSIC_SCHEMA = {
  required: ['intro', 'sections'],
  properties: {
    intro: { type: 'string' },
    sections: {
      type: 'array',
      minItems: 2,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'body', 'image_prompt'],
        properties: {
          title: { type: 'string' },
          body:  { type: 'string' },
          image_prompt: { type: 'string' },
        },
      },
    },
  },
};

/**
 * Normalize a classic structure post-AI-call. Ensures every section has the
 * fields the templates expect, even when the AI omits an optional.
 */
function normalizeClassic(structure) {
  if (!Array.isArray(structure.sections)) {
    structure.sections = [];
  }

  structure.sections = structure.sections.map((s, i) => ({
    title:        s.title || `Section ${i + 1}`,
    body:         s.body || '',
    image_prompt: s.image_prompt || '',
  }));

  structure.intro = structure.intro || '';
}

module.exports = { CLASSIC_SCHEMA, normalizeClassic };
