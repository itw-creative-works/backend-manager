/**
 * Brand-fit filter for newsletter sources.
 *
 * Given a pool of raw newsletter sources and a brand's `marketing.newsletter.content`
 * config, asks an AI to score each source for brand fit (0-10), then drops
 * anything below the threshold. This prevents off-topic sources from leaking
 * into the structure generator.
 *
 * Fit scoring is a single AI call (one round-trip for the whole pool), using
 * a small/cheap model by default.
 */
const DEFAULT_MODELS = {
  openai: 'gpt-5.4-mini',
  anthropic: 'claude-opus',
  'claude-code': 'claude-opus-4-7',
};

const DEFAULT_THRESHOLD = 6; // 0-10 scale; only sources scoring >= this make it through

const FILTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scores'],
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'fit', 'reason'],
        properties: {
          id:     { type: 'string' },
          fit:    { type: 'integer', minimum: 0, maximum: 10 },
          reason: { type: 'string' },
        },
      },
    },
  },
};

/**
 * Score sources for brand fit and return only the ones above threshold.
 *
 * @param {object} args
 * @param {Array<object>} args.sources - raw source records
 * @param {object} args.brand - { name, description }
 * @param {object} args.newsletterConfig
 * @param {object} args.ai
 * @param {object} args.assistant
 * @param {number} [args.threshold] - override fit threshold (default 6)
 * @returns {Promise<{kept: object[], scores: object[]}>}
 */
async function filterSources({ sources, brand, newsletterConfig, ai, assistant, threshold }) {
  if (!sources?.length) {
    return { kept: [], scores: [] };
  }

  const t = typeof threshold === 'number' ? threshold : DEFAULT_THRESHOLD;
  const provider = newsletterConfig?.provider?.filter || 'openai';
  const model = newsletterConfig?.model?.filter || DEFAULT_MODELS[provider];
  const startTime = Date.now();

  assistant.log(`Newsletter filter: scoring ${sources.length} sources (provider=${provider} threshold=${t})`);

  const systemPrompt = buildSystemPrompt(brand, newsletterConfig);
  const userPrompt = buildUserPrompt(sources);

  let scores = [];
  let aiResult = null;

  try {
    aiResult = await ai.request({
      provider,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      response: 'json',
      schema: FILTER_SCHEMA,
      maxTokens: 8000,
      temperature: 0.2,
      moderate: false,
    });

    scores = aiResult.content?.scores || [];

    if (!scores.length) {
      assistant.log(`Newsletter filter: AI returned no scores. Raw content: ${JSON.stringify(aiResult.content)?.slice(0, 500)}`);
    }
  } catch (e) {
    assistant.error(`Filter failed: ${e.message}. Falling back to no filtering.`);
    return {
      kept: sources,
      scores: [],
      meta: { provider, model, durationMs: Date.now() - startTime, error: e.message },
    };
  }

  // Index scores by source id
  const scoreById = new Map(scores.map((s) => [s.id, s]));

  // Log all scores up front for visibility (sorted highest fit first)
  const sortedScores = [...scores].sort((a, b) => b.fit - a.fit);
  for (const s of sortedScores) {
    assistant.log(`  fit=${s.fit} ${s.id} — ${s.reason}`);
  }

  // Keep sources scoring >= threshold; preserve original order
  const kept = sources.filter((s) => {
    const score = scoreById.get(s.id);
    return score && score.fit >= t;
  });

  assistant.log(`Newsletter filter: kept ${kept.length}/${sources.length} sources (threshold=${t})`);

  return {
    kept,
    scores,
    meta: {
      provider,
      model,
      durationMs: Date.now() - startTime,
      threshold: t,
      sourcesIn: sources.length,
      sourcesKept: kept.length,
      tokens: aiResult?.tokens || null,
    },
  };
}

function buildSystemPrompt(brand, config) {
  const tone = config?.tone || 'professional';
  const instructions = config?.instructions || '';
  const categories = (config?.categories || []).join(', ') || 'general';

  return [
    `You evaluate which third-party newsletter content is on-brand for ${brand?.name || 'a brand'} to feature in their own newsletter.`,
    brand?.tagline     ? `\n${brand.name} tagline: ${brand.tagline}`         : '',
    brand?.description ? `\n${brand.name} description: ${brand.description}` : '',
    instructions       ? `\nNewsletter focus: ${instructions}`               : '',
    `\nContent categories this brand wants: ${categories}`,
    `\nIntended tone: ${tone}`,
    '',
    'The user will give you a JSON array of source articles (forwarded newsletter excerpts).',
    'For EACH source, judge whether the topic fits this brand\'s audience and assign a fit score 0–10:',
    '  10 = directly about this brand\'s domain — their audience definitely cares',
    '   7 = adjacent/related topic — plausible audience interest',
    '   4 = tangentially relevant',
    '   0 = off-topic — wrong audience or wrong domain',
    '',
    'Be honest and discerning — off-topic content should score low even if interesting.',
    'Fit is about whether THIS BRAND\'S audience would care, not about the article\'s general quality.',
    '',
    'Output schema: { "scores": [{ "id": string, "fit": integer, "reason": string }] }',
    'RULES:',
    '  • Use the EXACT id value from each input source (e.g. "-OsTDh6dAWqUQrcq7B3T"). Do NOT invent or rename ids.',
    '  • Return one entry per input source — same count, same ids.',
    '  • reason: one short sentence (≤20 words).',
  ].filter(Boolean).join('\n');
}

function buildUserPrompt(sources) {
  // Hand the AI a JSON array — eliminates ambiguity about what the id is
  const payload = sources.map((s) => {
    const raw = s.source || {};
    return {
      id: s.id,
      from: raw.from || s.from || '',
      subject: raw.subject || s.subject || '',
      categories: s.categories || (s.category ? [s.category] : []),
      preview: (raw.content || '').slice(0, 400).replace(/\s+/g, ' '),
    };
  });

  return `Score these ${sources.length} sources for brand fit. Return EXACTLY one score per source, using the "id" field verbatim from the input.\n\nInput sources:\n${JSON.stringify(payload, null, 2)}`;
}

module.exports = { filterSources, FILTER_SCHEMA, DEFAULT_THRESHOLD };
