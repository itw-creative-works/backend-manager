/**
 * Classic newsletter content schema — used by `clean` and `editorial`.
 *
 * Both templates consume the same shape:
 *   - intro: 1-2 sentence preamble
 *   - sections: list of {title, body, cta?, image_prompt}
 *
 * Defined here so adding a new field (e.g. an eyebrow per section) updates
 * every classic-style template at once. Templates with fundamentally
 * different content shapes (Field Report, Postcard, Almanac) declare their
 * own schema instead.
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
        required: ['title', 'body', 'image_prompt', 'cta'],
        properties: {
          title: { type: 'string' },
          body:  { type: 'string' },
          cta: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['label', 'url'],
            properties: {
              label: { type: 'string' },
              url:   { type: 'string' },
            },
          },
          image_prompt: { type: 'string' },
        },
      },
    },
  },
};

/**
 * Normalize a classic structure post-AI-call. Ensures every section has the
 * fields the templates expect, even when the AI omits an optional like cta.
 */
function normalizeClassic(structure) {
  if (!Array.isArray(structure.sections)) {
    structure.sections = [];
  }

  structure.sections = structure.sections.map((s, i) => ({
    title:        s.title || `Section ${i + 1}`,
    body:         s.body || '',
    cta:          s.cta || null,
    image_prompt: s.image_prompt || '',
  }));

  structure.intro = structure.intro || '';
}

module.exports = { CLASSIC_SCHEMA, normalizeClassic };
