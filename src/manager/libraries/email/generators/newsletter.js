/**
 * Newsletter generator — pulls content from parent server and assembles a branded newsletter.
 *
 * Called by the marketing-campaigns cron when a campaign has `generator: 'newsletter'`.
 * Instead of sending the campaign directly, this generates the content first,
 * then returns the assembled settings for the cron to send.
 *
 * Flow:
 *   1. Read newsletter categories from Manager.config.marketing.newsletter.categories
 *   2. Fetch ready sources from parent server (GET /newsletter/sources)
 *   3. AI assembles sources into branded markdown newsletter
 *   4. Mark sources as used on parent server (PUT /newsletter/sources)
 *   5. Return assembled settings with content filled in
 */
const fetch = require('wonderful-fetch');

/**
 * Generate newsletter content from parent server sources.
 *
 * @param {object} Manager - BEM Manager instance
 * @param {object} assistant - BEM assistant instance
 * @param {object} settings - Campaign settings from the recurring template
 * @returns {object} Updated settings with content filled in, or null if no content available
 */
async function generate(Manager, assistant, settings) {
  const config = Manager.config?.marketing?.newsletter;

  if (!config?.enabled) {
    assistant.log('Newsletter generator: disabled in config');
    return null;
  }

  const categories = config.categories || [];

  if (!categories.length) {
    assistant.log('Newsletter generator: no categories configured');
    return null;
  }

  const parentUrl = Manager.config?.parent?.apiUrl;

  if (!parentUrl) {
    assistant.log('Newsletter generator: no parent API URL configured');
    return null;
  }

  // Fetch and atomically claim sources from parent server
  const brandId = Manager.config?.brand?.id;
  const sources = await fetchSources(parentUrl, categories, brandId, assistant);

  if (!sources.length) {
    assistant.log('Newsletter generator: no sources available');
    return null;
  }

  assistant.log(`Newsletter generator: ${sources.length} sources found, assembling...`);

  const brand = Manager.config?.brand;

  // AI assembles sources into newsletter with subject + preheader + content
  const assembled = await assembleNewsletter(Manager, assistant, sources, brand);

  if (!assembled) {
    assistant.log('Newsletter generator: AI assembly failed');
    return null;
  }

  // Mark sources as used on parent server
  await claimSources(parentUrl, sources, brand?.id, assistant);

  // Return updated settings — AI-generated fields override template placeholders
  return {
    ...settings,
    subject: assembled.subject,
    preheader: assembled.preheader,
    content: assembled.content,
  };
}

/**
 * Fetch ready newsletter sources from the parent server.
 */
async function fetchSources(parentUrl, categories, brandId, assistant) {
  const allSources = [];

  for (const category of categories) {
    try {
      const data = await fetch(`${parentUrl}/backend-manager/newsletter/sources`, {
        method: 'get',
        response: 'json',
        timeout: 15000,
        query: {
          category,
          limit: 3,
          claimFor: brandId,
          backendManagerKey: process.env.BACKEND_MANAGER_KEY,
        },
      });

      if (data.sources?.length) {
        allSources.push(...data.sources);
      }
    } catch (e) {
      assistant.error(`Newsletter generator: Failed to fetch ${category} sources:`, e.message);
    }
  }

  return allSources;
}

/**
 * Assemble newsletter sources into a branded newsletter via AI.
 * Returns { subject, preheader, content } or null on failure.
 */
async function assembleNewsletter(Manager, assistant, sources, brand) {
  const ai = require('../../openai.js');

  const sourceSummaries = sources.map((s, i) =>
    `[${i + 1}] ${s.ai?.headline || s.subject}\n${s.ai?.summary || ''}\nTakeaways: ${(s.ai?.takeaways || []).join('; ')}`
  ).join('\n\n');

  try {
    const result = await ai.request({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a newsletter writer for ${brand?.name || 'a tech company'}. ${brand?.description || ''}

Given source articles, write a branded newsletter in markdown. Be concise, engaging, and professional.

Respond in JSON:
{
  "subject": "Catchy email subject line (max 60 chars, no emojis)",
  "preheader": "Preview text that complements the subject (max 100 chars)",
  "content": "Full newsletter body in markdown with ## section headers"
}

Guidelines:
- Start with a brief intro (1-2 sentences)
- Each source becomes a section with ## header
- Rewrite in your own voice — don't copy verbatim
- End with a short sign-off
- Keep it scannable — use bold, bullets, short paragraphs`,
        },
        {
          role: 'user',
          content: `Write a newsletter from these ${sources.length} sources:\n\n${sourceSummaries}`,
        },
      ],
      response_format: { type: 'json_object' },
      apiKey: process.env.BACKEND_MANAGER_OPENAI_API_KEY,
    });

    return result.content;
  } catch (e) {
    assistant.error('Newsletter AI assembly failed:', e.message);
    return null;
  }
}

/**
 * Mark sources as used on the parent server.
 */
async function claimSources(parentUrl, sources, brandId, assistant) {
  for (const source of sources) {
    try {
      await fetch(`${parentUrl}/backend-manager/newsletter/sources`, {
        method: 'put',
        response: 'json',
        timeout: 10000,
        body: {
          id: source.id,
          usedBy: brandId || 'unknown',
          backendManagerKey: process.env.BACKEND_MANAGER_KEY,
        },
      });
    } catch (e) {
      assistant.error(`Newsletter generator: Failed to claim source ${source.id}:`, e.message);
    }
  }
}

module.exports = { generate };
