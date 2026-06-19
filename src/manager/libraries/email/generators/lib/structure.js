/**
 * Newsletter structure generator — AI authors the copy + section layout.
 *
 * The schema and AI prompt are NOT fixed here. Each template owns what content
 * it needs and how the AI should write it (template.schema, template.buildPrompt).
 * This module merges the template's contract with the universal base contract
 * (subject, preheader, signoff, citations — things the shell always renders),
 * dispatches the AI call, and normalizes the result.
 *
 * Why template-owned schemas:
 *   - Different aesthetics demand fundamentally different content. A "Field
 *     Report" template wants bylines + data callouts + dispatch-style prose; a
 *     "Postcard" template wants a hand-written note + image caption. Forcing
 *     them through one universal `{title, body, cta}` shape produces lookalike
 *     output regardless of layout.
 *   - The template knows what it's going to render — let it ask for that.
 *
 * Trade-off: theme-only iteration (skipping the AI step on re-runs) only works
 * within the same template. Switching templates means a new AI call, because
 * the cached structure won't match the new template's schema. That's correct
 * behavior — different templates produce different content.
 *
 * Provider defaults to OpenAI (structured JSON output is more reliable on GPT
 * via JSON schema). Can be overridden per-brand via
 * `marketing.newsletter.content.provider.structure`.
 */
const { resolveNewsletterTemplate: resolveTemplate } = require('./templates/index.js');

const DEFAULT_MODELS = {
  openai: 'gpt-5.4-mini',
  anthropic: 'claude-opus',
  'claude-code': 'claude-opus-4-7',
};

/**
 * BASE_SCHEMA — the universal contract that EVERY newsletter must satisfy
 * regardless of template. These are the fields the shell uses unconditionally
 * (subject/preheader for email metadata, signoff for the closing card,
 * citations for the footnote block).
 *
 * Templates extend this with their own `schema` export, which is merged into
 * `properties` and `required` before the AI call.
 */
const BASE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'preheader', 'signoff', 'citations', 'tags', 'summary'],
  properties: {
    subject:   { type: 'string', maxLength: 80 },
    preheader: { type: 'string', maxLength: 120 },
    signoff:   { type: 'string' },
    // Two-to-three-sentence editorial summary of the issue. Used as the body of
    // `summary.md` alongside the newsletter, and as a preview snippet when the
    // issue is shared. Distinct from preheader (which is an inbox-preview hook).
    summary:   { type: 'string', maxLength: 600 },
    // Topical tags for the issue. Flow into Beehiiv's `content_tags` field on
    // the post draft (array of strings, lowercase, kebab-case preferred).
    // Empty array is valid.
    tags: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string', maxLength: 40 },
    },
    // Citations for hard data (statistics, numbers, direct quotes) pulled from sources.
    // Rendered as a small footnote section at the bottom of the newsletter — never inline.
    // Empty array is valid (most newsletters won't need citations).
    citations: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['note', 'source'],
        properties: {
          note:   { type: 'string' }, // The cited fact, e.g. "70% of social media managers report..."
          source: { type: 'string' }, // Free-form attribution, e.g. "Reported in industry coverage, May 2026"
        },
      },
    },
  },
};

/**
 * Merge a template's schema fragment into BASE_SCHEMA. The template's
 * `properties` are merged in, and its `required` is concatenated.
 *
 * Templates that don't export a schema get BASE_SCHEMA only — they'll be
 * limited to subject/preheader/signoff/citations. That's a useful escape
 * hatch for transactional / receipt-style newsletters that don't need
 * editorial sections.
 */
function mergeSchemas(base, fragment) {
  if (!fragment) {
    return base;
  }

  return {
    ...base,
    required: [...(base.required || []), ...(fragment.required || [])],
    properties: {
      ...base.properties,
      ...(fragment.properties || {}),
    },
  };
}

/**
 * Default prompt builder — used by templates that don't override
 * buildPrompt. Produces the "classic" newsletter brief (intro + sections
 * with title/body/cta/image_prompt + signoff).
 *
 * Templates that want a different content shape (Field Report, Almanac,
 * Postcard, etc.) export their own buildPrompt.
 */
function defaultBuildPrompt({ brand, newsletterConfig, sources }) {
  return {
    system: buildClassicSystemPrompt(brand, newsletterConfig),
    user:   buildClassicUserPrompt(sources),
  };
}

/**
 * Generate the newsletter structure from a list of sources.
 *
 * The active template controls the schema and the AI prompt. This function
 * is a generic dispatcher: it resolves the template, merges schemas, asks
 * the template to build the prompt, calls the AI, and normalizes the result.
 *
 * @param {object} args
 * @param {Array<object>} args.sources - Newsletter source records (id, subject, ai: { headline, summary, takeaways })
 * @param {object} args.brand - { name, url, id, description? }
 * @param {object} args.newsletterConfig - marketing.newsletter.content from BEM config
 * @param {object} args.ai - AI instance from Manager.AI(assistant)
 * @param {object} args.assistant - BEM assistant
 * @returns {Promise<object>} Structured newsletter object
 */
async function generateStructure({ sources, brand, newsletterConfig, ai, assistant }) {
  if (!sources?.length) {
    throw new Error('generateStructure requires at least one source');
  }

  const templateName = newsletterConfig?.template || 'clean';
  const template = resolveTemplate(templateName);

  const provider = newsletterConfig?.provider?.structure || 'openai';
  const model = newsletterConfig?.model?.structure || DEFAULT_MODELS[provider];
  const startTime = Date.now();

  // Build the schema: BASE + template-specific fields
  const schema = mergeSchemas(BASE_SCHEMA, template.schema);

  // Build the AI prompt: template owns voice/structure brief, base owns attribution rules
  const buildPrompt = template.buildPrompt || defaultBuildPrompt;
  const { system, user } = buildPrompt({ brand, newsletterConfig, sources });

  assistant.log(`Newsletter structure: template=${templateName} provider=${provider} model=${model} sources=${sources.length}`);

  const result = await ai.request({
    provider,
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user },
    ],
    response: 'json',
    schema,
    maxTokens: 3000,
    temperature: 0.7,
    moderate: false,
  });

  const structure = result.content;

  // Validate universals
  if (!structure?.subject) {
    throw new Error('AI returned invalid newsletter structure (missing subject)');
  }

  // Normalize universals
  structure.subject   = structure.subject   || '';
  structure.preheader = structure.preheader || '';
  structure.signoff   = structure.signoff   || `Best,\nThe ${brand?.name || 'Team'} Team`;
  structure.citations = Array.isArray(structure.citations) ? structure.citations : [];
  structure.tags      = Array.isArray(structure.tags) ? structure.tags : [];
  structure.summary   = typeof structure.summary === 'string' ? structure.summary : '';

  // Let the template normalize its own fields (e.g. sections defaults).
  // Falls back to a sane default if the template doesn't ship one.
  if (typeof template.normalize === 'function') {
    template.normalize(structure, { brand, newsletterConfig });
  }

  // Attach metadata (non-enumerable so it doesn't pollute JSON serialization of the structure itself)
  Object.defineProperty(structure, '_meta', {
    enumerable: false,
    value: {
      template: templateName,
      provider,
      model,
      durationMs: Date.now() - startTime,
      sourcesIn: sources.length,
      tokens: result.tokens || null,
    },
  });

  return structure;
}

// ---------- Default "classic" prompt (clean + editorial use this) ----------

function buildClassicSystemPrompt(brand, config) {
  const tone = config?.tone || 'professional';
  const instructions = config?.instructions || '';
  const taglineLine    = brand?.tagline     ? `\nTagline: ${brand.tagline}`            : '';
  const descriptionLine = brand?.description ? `\nDescription: ${brand.description}` : '';

  return [
    `You are a newsletter writer for ${brand?.name || 'a tech company'}.${taglineLine}${descriptionLine}`,
    instructions ? `\nBrand instructions:\n${instructions}` : '',
    `\nTone: ${tone}`,
    '',
    'You will be given a set of "source articles" — these are background research, NOT publications you are writing for or about.',
    'Treat them as raw information. Synthesize the IDEAS into original content written as if you are the original author.',
    '',
    'CRITICAL ATTRIBUTION RULES:',
    '- NEVER name the source publication, newsletter, blog, or author in the body of the newsletter.',
    '  (e.g., do NOT write "according to Daily Carnage", "as reported by Morning Brew", "Forbes says…", etc.)',
    '- NEVER use phrases like "a recent article said", "according to sources", "industry coverage", or similar dodges that hint at the source.',
    '- Write the body AS IF the source did not exist — the content should read as original, first-party reporting from the brand.',
    '- If a source mentions a third-party platform, product, or company by name (e.g., LinkedIn, YouTube, Apple), THAT is fine — those are subjects of the news, not the source. Name them freely.',
    '',
    'CITATIONS:',
    '- If the source contains hard data — specific statistics, percentages, dollar amounts, dates, study results — paraphrase them before including in the body. Never copy exact figures from the source. Round numbers, change units or scale, reframe percentages as ratios or fractions, and vary phrasing. The meaning and magnitude must stay accurate but the expression must be different enough that it cannot be traced back to the source (e.g. "$7.5 billion" becomes "north of $7 billion"; "60%" becomes "close to six in ten"; "47,000 of 500,000" becomes "fewer than 50,000 of a planned half-million").',
    '- Then add a corresponding entry to the `citations` array with:',
    '    - note: the cited fact (e.g. "Crosscheck AI flagged 12,000 impersonation attempts in beta")',
    '    - source: a neutral attribution that does NOT name the source publication (e.g. "Reported by LinkedIn product team, May 2026", "Per company beta data", "Industry research, Q2 2026")',
    '- Citations render as small footnotes at the BOTTOM of the newsletter — never inline.',
    '- If a section has no hard data worth citing, do not invent citations. Empty array is fine.',
    '',
    'CONTENT REQUIREMENTS:',
    '- Subject (≤60 chars, no emojis, attention-grabbing but not clickbait)',
    '- Preheader (≤100 chars, complements the subject)',
    '- Summary (2-3 sentences, plain text, no markdown) — an editorial recap of the issue, written like a TL;DR. Distinct from preheader (which is an inbox hook). This is what someone reads if they only have 10 seconds.',
    '- Tags (3-5 short topical tags, lowercase, kebab-case, no spaces) — e.g. "linkedin", "creator-economy", "platform-policy". Empty array is fine if nothing fits.',
    '- Intro (1-2 sentences, markdown allowed) — frame the issue as if you are setting up your own reporting',
    '- 3-5 sections — each is ONE topic, rewritten in your voice as original content',
    '- Each section: title (compelling, scannable), body (80-150 words, markdown OK)',
    '- Each section: image_prompt — one-sentence visual description for an illustrator. Be specific about subject/style.',
    '- Do NOT include CTAs, "read more" links, or any URLs in section bodies. The newsletter is a self-contained read — never invent links or send readers off-property.',
    `- Signoff: a SHORT human sign-off, formatted as two lines with \\n between them. First line is a closing phrase like "Best,", "Cheers,", "Until next week,", or "Stay sharp,". Second line is the team name like "The ${brand?.name || 'Team'} Team". Example: "Best,\\nThe ${brand?.name || 'Team'} Team". Do NOT write a summary, tagline, motto, or thematic conclusion sentence — this is the literal way you sign off the email, like the end of a letter.`,
    '- citations: array of { note, source } for any hard data referenced. Empty array if none.',
    '',
    'STYLE:',
    '- Do NOT copy source text verbatim. Paraphrase all facts, figures, and phrasing. Synthesize and rewrite in your voice.',
    '- Do NOT use emojis, hashtags, or "guru" language unless brand instructions say otherwise.',
    '- Respond with valid JSON only — no markdown fences, no preamble.',
  ].filter(Boolean).join('\n');
}

function buildClassicUserPrompt(sources) {
  // Note: we intentionally do NOT pass through the source publication name (raw.from)
  // to the AI prompt. Removing it means the AI literally cannot leak it into the body.
  // The "from" field is metadata about WHERE the research came from, not content to reference.
  const summaries = sources
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

  return `Write a newsletter using the following research as background. Do not name or reference these research items — synthesize the ideas into original content.\n\n${summaries}`;
}

module.exports = {
  generateStructure,
  BASE_SCHEMA,
  defaultBuildPrompt,
  mergeSchemas,
  // Re-exported helpers so templates can reuse the classic prompt patterns
  buildClassicSystemPrompt,
  buildClassicUserPrompt,
};
