/**
 * Image illustrator — AI generates a flat-vector PNG illustration per section
 * directly via OpenAI's image model (gpt-image-2), no SVG-author-then-rasterize step.
 *
 * This is the DEFAULT newsletter illustration method. It replaces the older
 * svg-illustrator.js approach (AI writes an <svg>, resvg rasterizes it) which is
 * still available as a fallback via newsletterConfig.method.image = 'svg'.
 *
 * Output matches svg-illustrator's contract: { png: Buffer, fallback, meta }.
 * The newsletter pipeline (image-host.js) only requires `img.png` to be a PNG Buffer.
 *
 * Style: clean flat 2D vector illustration (Stripe / Linear / undraw.co aesthetic),
 * built from the brand palette, on a white background, no text. The prompt mirrors
 * the validated spike in scripts/.temp/ai-image-test/.
 */
const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_SIZE = '1024x1024';     // square reads best for flat section art
const DEFAULT_QUALITY = 'medium';     // medium is plenty for flat vector; ~40-50s/image

/**
 * Generate one illustration for a section.
 *
 * @param {object} args
 * @param {string} args.imagePrompt - Visual description from the structure
 * @param {object} args.brand - { name, tagline, color: { primary, secondary, ... } }
 * @param {object} args.newsletterConfig - marketing.beehiiv.content
 * @param {object} args.ai - Manager.AI() instance
 * @param {object} args.assistant - BEM assistant
 * @returns {Promise<{png: Buffer, fallback: boolean, meta: object}>}
 */
async function generateSectionImage({ imagePrompt, brand, newsletterConfig, ai, assistant }) {
  const startTime = Date.now();
  const model = newsletterConfig?.model?.image || DEFAULT_MODEL;
  const size = newsletterConfig?.image?.size || DEFAULT_SIZE;
  const quality = newsletterConfig?.image?.quality || DEFAULT_QUALITY;

  const palette = resolvePalette(brand, newsletterConfig);
  const subject = imagePrompt || 'An abstract geometric shape representing the topic.';
  const prompt = buildImagePrompt({ brand, palette, subject });

  let png = null;
  let fallback = false;
  let revisedPrompt = null;
  let attempts = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    attempts++;
    try {
      const result = await ai.image({
        provider: 'openai',
        model,
        prompt,
        size,
        quality,
        background: 'opaque',
      });

      if (result?.png || result?.buffer) {
        png = result.png || result.buffer;
        revisedPrompt = result.revisedPrompt || null;
        break;
      }

      assistant.log(`Image generation attempt ${attempt + 1} returned no buffer`);
    } catch (e) {
      assistant.error(`Image generation attempt ${attempt + 1} failed: ${e.message}`);
    }
  }

  // No transparent-PNG placeholder fallback that's valid as an image — if both
  // attempts fail, return a 1x1 transparent PNG so the pipeline doesn't crash on
  // a non-Buffer. The caller logs and proceeds.
  if (!png) {
    png = TRANSPARENT_PNG;
    fallback = true;
  }

  return {
    png,
    fallback,
    meta: {
      method: 'image',
      provider: 'openai',
      model,
      size,
      quality,
      durationMs: Date.now() - startTime,
      attempts,
      fallback,
      revisedPrompt,
    },
  };
}

/**
 * Resolve brand palette — same precedence as svg-illustrator.js#resolvePalette:
 * newsletter theme colors → brand.color.* → sensible defaults.
 */
function resolvePalette(brand, newsletterConfig) {
  const theme = newsletterConfig?.theme || {};

  return {
    primary:   theme.primaryColor   || brand?.color?.primary   || '#4B5BFF',
    secondary: theme.secondaryColor || brand?.color?.secondary || '#1E1E2A',
    accent:    theme.accentColor    || brand?.color?.accent    || '#F4F6FA',
  };
}

/**
 * Build the flat-vector art-direction prompt with brand identity + palette baked in.
 * Mirrors the validated prompt from scripts/.temp/ai-image-test/generate.js.
 */
function buildImagePrompt({ brand, palette, subject }) {
  const { primary, secondary, accent } = palette;
  const name = brand?.name || 'the brand';
  const tagline = brand?.tagline ? ` — ${brand.tagline}` : '';

  return [
    `Minimal flat vector illustration for the newsletter of "${name}"${tagline}.`,
    '',
    'STYLE: modern flat 2D vector illustration, like the marketing graphics on',
    'Stripe, Linear, Vercel, Notion, or undraw.co. Clean geometric shapes with',
    'flat solid color fills and crisp edges. Simple, friendly, and minimal.',
    '',
    'ABSOLUTELY NOT: no photorealism, no 3D renders, no realistic textures, no',
    'photography, no depth of field, no dramatic lighting, no film grain, no',
    'shading or gradients beyond a single subtle flat tone shift, no glossy',
    'reflections, no metallic surfaces. This must look hand-designed in a vector',
    'tool (Figma/Illustrator), NOT rendered or photographed.',
    '',
    'PALETTE (use ONLY these flat colors, plus white):',
    `- Primary:   ${primary}`,
    `- Secondary: ${secondary}`,
    `- Accent:    ${accent}`,
    'Flat solid fills only. A clean white or very-light background.',
    '',
    'COMPOSITION: single clear simple subject, lots of clean negative space,',
    'centered or rule-of-thirds, uncluttered, plenty of breathing room.',
    '',
    'HARD CONSTRAINTS: absolutely NO text, NO words, NO letters, NO numbers,',
    'NO logos, NO watermarks, NO UI mockups, NO borders or frames.',
    '',
    `SUBJECT (the focal scene to illustrate): ${subject}`,
  ].join('\n');
}

// 1x1 transparent PNG — last-resort fallback so a failed generation still yields a
// valid PNG Buffer instead of crashing image-host.js's Buffer check.
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

module.exports = { generateSectionImage };
