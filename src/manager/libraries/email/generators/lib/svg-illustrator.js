/**
 * SVG illustrator — AI authors per-section SVG illustrations, rasterized to PNG.
 *
 * Each section in a newsletter gets one illustration. Default provider is
 * OpenAI Codex (gpt-5.3-codex) — markup/code-specialized GPT-5 variant tuned
 * for structured output. SVG is just structured markup, so Codex is the right
 * fit. Anthropic is supported as a fallback provider.
 *
 * Output is both the raw SVG string (for debugging) and a rasterized PNG buffer
 * (for embedding). Local file persistence is the caller's responsibility — this
 * module returns buffers only.
 *
 * Provider-specific default models:
 *   openai → gpt-5.3-codex  (Codex family is markup/code-specialized; SVG is
 *                            structured markup. ~$0.005-0.015/image.)
 *   anthropic → claude-opus (Claude is good at artistic SVG.)
 */
const { Resvg } = require('@resvg/resvg-js');

const DEFAULT_PROVIDER = 'openai';

const DEFAULT_MODELS = {
  openai: 'gpt-5.3-codex',
  anthropic: 'claude-opus',
  'claude-code': 'claude-opus-4-7',
};

const PNG_WIDTH = 800; // 2x display width of 400px container

/**
 * Generate one illustration for a section.
 *
 * @param {object} args
 * @param {string} args.imagePrompt - Visual description from the structure
 * @param {object} args.brand - { name, color: { primary, secondary, ... } }
 * @param {object} args.newsletterConfig - marketing.newsletter.content
 * @param {object} args.ai - AI instance
 * @param {object} args.assistant - BEM assistant
 * @returns {Promise<{svg: string, png: Buffer, fallback: boolean}>}
 */
async function generateSectionImage({ imagePrompt, brand, newsletterConfig, ai, assistant }) {
  const provider = newsletterConfig?.provider?.svg || DEFAULT_PROVIDER;
  const model = newsletterConfig?.model?.svg || DEFAULT_MODELS[provider];
  const startTime = Date.now();

  const palette = resolvePalette(brand, newsletterConfig);
  const systemPrompt = buildSvgSystemPrompt(palette);
  const userPrompt = imagePrompt || 'An abstract geometric illustration representing the topic.';

  let svg = '';
  let fallback = false;
  let attempts = 0;
  let lastTokens = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    attempts++;
    try {
      const result = await ai.request({
        provider,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        response: 'text',
        maxTokens: 2000,
        temperature: attempt === 0 ? 0.8 : 0.4,
        moderate: false,
      });

      lastTokens = result.tokens;
      svg = extractSvg(result.content);

      if (svg) {
        break;
      }

      assistant.log(`SVG generation attempt ${attempt + 1} returned no valid <svg>`);
    } catch (e) {
      assistant.error(`SVG generation attempt ${attempt + 1} failed: ${e.message}`);
    }
  }

  let png;

  if (svg) {
    try {
      png = rasterize(svg);
    } catch (e) {
      assistant.error(`SVG rasterization failed, using fallback: ${e.message}`);
      svg = buildPlaceholderSvg(palette);
      png = rasterize(svg);
      fallback = true;
    }
  } else {
    svg = buildPlaceholderSvg(palette);
    png = rasterize(svg);
    fallback = true;
  }

  return {
    svg,
    png,
    fallback,
    meta: {
      provider,
      model,
      durationMs: Date.now() - startTime,
      attempts,
      fallback,
      tokens: lastTokens,
    },
  };
}

/**
 * Resolve brand palette from config theme + brand defaults.
 * Returns { primary, secondary, accent, bg, fg }
 */
function resolvePalette(brand, newsletterConfig) {
  const theme = newsletterConfig?.theme || {};

  return {
    primary:   theme.primaryColor   || brand?.color?.primary   || '#5B5BFF',
    secondary: theme.secondaryColor || brand?.color?.secondary || '#1E1E2A',
    accent:    theme.accentColor    || brand?.color?.accent    || '#F6F7FB',
    bg:        '#FFFFFF',
    fg:        '#1E1E2A',
  };
}

function buildSvgSystemPrompt(palette) {
  return [
    'You are an SVG illustrator. Produce a single self-contained SVG illustration.',
    '',
    'STRICT REQUIREMENTS:',
    '- viewBox="0 0 800 400"',
    '- No <text>, no <foreignObject>, no <script>, no <image>, no external references',
    '- Use only: <rect>, <circle>, <ellipse>, <path>, <line>, <polyline>, <polygon>, <g>',
    '- Maximum 20 shape elements total',
    '- No filters, no gradients beyond simple <linearGradient>',
    '- Output ONLY the SVG element. No markdown fences, no preamble, no explanation.',
    '',
    'PALETTE (use these colors exclusively):',
    `- Primary:   ${palette.primary}`,
    `- Secondary: ${palette.secondary}`,
    `- Accent:    ${palette.accent}`,
    `- Background: ${palette.bg}`,
    '',
    'STYLE: Flat, geometric, modern, minimal. Think Stripe, Linear, or Vercel marketing illustrations.',
    'COMPOSITION: Centered subject, balanced negative space, no busy clutter.',
  ].join('\n');
}

function extractSvg(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Strip markdown fences
  let cleaned = text.trim().replace(/^```(?:svg|xml)?\s*/i, '').replace(/\s*```$/i, '');

  // Find first <svg ... > ... </svg>
  const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i);

  if (!match) {
    return null;
  }

  return match[0];
}

function buildPlaceholderSvg(palette) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400">',
    `  <rect width="800" height="400" fill="${palette.accent}"/>`,
    `  <circle cx="400" cy="200" r="120" fill="${palette.primary}" opacity="0.85"/>`,
    `  <circle cx="320" cy="160" r="60"  fill="${palette.secondary}" opacity="0.7"/>`,
    `  <rect   x="480" y="240" width="120" height="80" fill="${palette.primary}" opacity="0.4"/>`,
    '</svg>',
  ].join('\n');
}

function rasterize(svgString) {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: 'width', value: PNG_WIDTH },
    background: 'rgba(0,0,0,0)',
  });

  return resvg.render().asPng();
}

module.exports = { generateSectionImage, rasterize };
