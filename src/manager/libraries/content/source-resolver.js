/**
 * Shared content-source resolution for blog + newsletter pipelines.
 *
 * Both blog-auto-publisher and newsletter-generator need to:
 *   - Resolve $feed:, $parent, $brand, URL, and text sources
 *   - Track used sources in Firestore (content-sources collection)
 *   - Deduplicate across runs
 *   - Follow anti-traceability rules
 *
 * This module is the single source of truth for all of that.
 */
const crypto = require('crypto');
const fetch = require('wonderful-fetch');

const { parseFeed, extractArticleContent } = require('./feed-parser.js');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const FEED_PREFIX = '$feed:';
const CONTENT_SOURCES_COLLECTION = 'content-sources';

// ── Prompt constants ─────────────────────────────────────────────────

const ANTI_TRACEABILITY = [
  'ATTRIBUTION RULES:',
  '- NEVER name the source publication, newsletter, blog, or author.',
  '- NEVER use phrases like "according to sources", "a recent article said", "as reported by", or similar.',
  '- Write AS IF the source did not exist — content should read as original, first-party work.',
  '- If the source mentions a third-party platform, product, or company by name, THAT is fine — those are subjects, not sources.',
  '- Paraphrase all facts, figures, and data. Never copy exact numbers verbatim.',
].join('\n');

const PROMPT_SOURCE = `
  Company: {brand.brand.name}: {brand.brand.description}
  Date: {date}
  Instructions: {instructions}
  Tone: {tone}
  Categories: {categories}
  Keywords: {keywords}

  Write an article covering the SAME topic as this source material.
  Keep the specific subject matter — names, companies, events, dates, numbers.
  Do NOT copy the source text — rewrite it in your own voice with a different angle, title, and structure.
  The article should read as if written by a completely different author covering the same subject.
  ${ANTI_TRACEABILITY}
  Source title: {sourceTitle}
`;

const PROMPT = `
  Company: {brand.brand.name}: {brand.brand.description}
  Date: {date}
  Instructions: {instructions}
  Tone: {tone}
  Categories: {categories}
  Keywords: {keywords}

  Use the following information to find a topic for our company blog (it can be about our company OR any topic that would be relevant to our website and business BUT not about a competitor):
  {suggestion}
`;

// ── Feed source processing ───────────────────────────────────────────

async function processFeedSource(assistant, feedUrl, brandId, admin) {
  const feedText = await fetch(feedUrl, {
    timeout: 30000,
    tries: 2,
    response: 'text',
    headers: { 'User-Agent': USER_AGENT },
  }).catch((e) => e);

  if (feedText instanceof Error) {
    assistant.error(`processFeedSource(): Failed to fetch feed: ${feedUrl}`, feedText);
    return null;
  }

  const { items } = parseFeed(feedText);
  if (!items.length) {
    assistant.log(`processFeedSource(): No items in feed: ${feedUrl}`);
    return null;
  }

  assistant.log(`processFeedSource(): Parsed ${items.length} items from feed`);

  const processedIds = await getProcessedItemIds(admin, feedUrl).catch((e) => {
    assistant.error('processFeedSource(): Error querying tracked items (continuing)', e);
    return new Set();
  });

  const unprocessed = items.filter((item) => !processedIds.has(item.id) && !processedIds.has(item.url));
  if (!unprocessed.length) {
    assistant.log(`processFeedSource(): All ${items.length} items already processed for: ${feedUrl}`);
    return null;
  }

  assistant.log(`processFeedSource(): ${unprocessed.length} unprocessed items available`);

  const item = unprocessed[0];

  let content = '';
  if (item.url) {
    content = await extractArticleContent(item.url).catch((e) => {
      assistant.error(`processFeedSource(): Failed to extract content from ${item.url} (using summary)`, e);
      return '';
    });
  }

  if (!content || content.length < 100) {
    content = item.content || item.summary || '';
  }

  return { item, content };
}

// ── Parent source processing ─────────────────────────────────────────

async function processParentSource(assistant, entry, admin, Manager) {
  const parentUrl = Manager?.getParentApiUrl?.();

  if (!parentUrl) {
    assistant.log('processParentSource(): No parent URL configured');
    return null;
  }

  const categories = entry.categories || [];
  const allSources = [];
  const categoriesToFetch = categories.length ? categories : [''];

  for (const category of categoriesToFetch) {
    const query = {
      limit: 3,
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
    };

    if (category) {
      query.category = category;
    }

    const data = await fetch(`${parentUrl}/newsletter-sources`, {
      method: 'get',
      response: 'json',
      timeout: 60000,
      query: query,
    }).catch((e) => {
      assistant.error(`processParentSource(): Failed to fetch sources for category=${category}: ${e.message}`);
      return null;
    });

    if (data?.sources?.length) {
      allSources.push(...data.sources);
    }
  }

  if (!allSources.length) {
    assistant.log('processParentSource(): No sources available from parent');
    return null;
  }

  if (admin) {
    const usedUrls = new Set();
    const snapshot = await admin.firestore()
      .collection(CONTENT_SOURCES_COLLECTION)
      .where('origin', '==', '$parent')
      .select('url')
      .get()
      .catch((e) => {
        assistant.error('processParentSource(): Error querying tracked sources (continuing)', e);
        return { docs: [] };
      });

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.url) {
        usedUrls.add(data.url);
      }
    });

    const available = allSources.filter((s) => !usedUrls.has(s.url || s.id));

    if (!available.length) {
      assistant.log('processParentSource(): All parent sources already used');
      return null;
    }

    return available;
  }

  return allSources;
}

// ── Parent source fetching for newsletter ────────────────────────────

async function fetchParentSources(parentUrl, categories, assistant) {
  const allSources = [];

  for (const category of categories) {
    try {
      const data = await fetch(`${parentUrl}/newsletter-sources`, {
        method: 'get',
        response: 'json',
        timeout: 60000,
        query: {
          category,
          limit: 3,
          backendManagerKey: process.env.BACKEND_MANAGER_KEY,
        },
      });

      if (data.sources?.length) {
        allSources.push(...data.sources);
      }
    } catch (e) {
      assistant.error(`fetchParentSources(): Failed to fetch ${category} sources: ${e.message}`);
    }
  }

  return allSources;
}

// ── Feed-to-newsletter normalization ─────────────────────────────────

function normalizeFeedItemForNewsletter(feedResult, feedUrl, categories) {
  const item = feedResult.item;
  let hostname = '';
  try { hostname = new URL(feedUrl).hostname; } catch (e) { /* ignore */ }

  return {
    id: item.id || item.url || '',
    title: item.title || '',
    subject: item.title || '',
    category: (categories && categories[0]) || '',
    categories: categories || [],
    url: item.url || '',
    source: {
      from: hostname,
      subject: item.title || '',
      content: feedResult.content || item.content || item.summary || '',
    },
    ai: null,
  };
}

// ── Resolve newsletter sources (feeds + parent + fallback) ───────────

async function resolveNewsletterSources({ sources, categories, admin, Manager, assistant }) {
  const resolved = [];

  const feedUrls = (sources || []).filter((s) => typeof s === 'string' && s.startsWith(FEED_PREFIX));
  const hasParent = (sources || []).includes('$parent');

  const brandId = Manager?.config?.brand?.id || '';

  for (const source of feedUrls) {
    const feedUrl = source.slice(FEED_PREFIX.length);
    const feedResult = await processFeedSource(assistant, feedUrl, brandId, admin);
    if (feedResult) {
      resolved.push(normalizeFeedItemForNewsletter(feedResult, feedUrl, categories));
    }
  }

  if (hasParent) {
    const parentUrl = Manager?.getParentApiUrl?.();
    if (parentUrl) {
      const parentSources = await fetchParentSources(parentUrl, categories || [], assistant);
      resolved.push(...parentSources);
    }
  }

  return resolved;
}

// ── Firestore tracking ──────────────────────────────────────────────

async function trackContentSource(admin, { url, origin, feedUrl, itemId, itemTitle, usedBy, brandId, postUrl, postSlug }) {
  const docId = contentSourceHash(origin || '', url || '');
  const nowISO = new Date().toISOString();
  const nowUNIX = Math.round(Date.now() / 1000);

  await admin.firestore().doc(`${CONTENT_SOURCES_COLLECTION}/${docId}`).set({
    url: url || null,
    origin: origin || null,
    feedUrl: feedUrl || null,
    itemId: itemId || null,
    itemTitle: itemTitle || null,
    usedBy: usedBy || null,
    brandId: brandId || null,
    postUrl: postUrl || null,
    postSlug: postSlug || null,
    metadata: {
      created: { timestamp: nowISO, timestampUNIX: nowUNIX },
      updated: { timestamp: nowISO, timestampUNIX: nowUNIX },
    },
  });
}

function contentSourceHash(origin, url) {
  return crypto.createHash('sha256').update(`${origin}::${url}`).digest('hex').slice(0, 20);
}

async function getProcessedItemIds(admin, feedUrl) {
  if (!admin) {
    return new Set();
  }

  const snapshot = await admin.firestore()
    .collection(CONTENT_SOURCES_COLLECTION)
    .where('feedUrl', '==', feedUrl)
    .select('itemId', 'url')
    .get();

  const ids = new Set();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.itemId) {
      ids.add(data.itemId);
    }
    if (data.url) {
      ids.add(data.url);
    }
  });

  return ids;
}

// ── URL content extraction ──────────────────────────────────────────

function getURLContent(url) {
  return fetch(url, {
    timeout: 120000,
    tries: 3,
    response: 'raw',
    headers: { 'User-Agent': USER_AGENT },
  })
  .then(async (res) => {
    const contentType = res.headers.get('content-type');
    const text = await res.text();
    return extractBodyContent(text, contentType, url);
  });
}

function isURL(url) {
  try {
    return !!new URL(url);
  } catch (e) {
    return false;
  }
}

function extractBodyContent(text) {
  const parsed = tryParse(text);

  if (parsed) {
    if (parsed.items) {
      return parsed.items.map((i) => `${i.title}: ${i.content_text}`).join('\n');
    }
    return text;
  }

  const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) {
    return '';
  }

  let bodyContent = bodyMatch[1];
  bodyContent = bodyContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  bodyContent = bodyContent.replace(/<meta[^>]*>/gi, '');

  return bodyContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tryParse(json) {
  try {
    return require('json5').parse(json);
  } catch (e) {
    return null;
  }
}

// ── Exports ─────────────────────────────────────────────────────────

module.exports = {
  PROMPT_SOURCE,
  PROMPT,
  ANTI_TRACEABILITY,
  FEED_PREFIX,
  CONTENT_SOURCES_COLLECTION,
  USER_AGENT,
  processFeedSource,
  processParentSource,
  fetchParentSources,
  resolveNewsletterSources,
  normalizeFeedItemForNewsletter,
  trackContentSource,
  contentSourceHash,
  getProcessedItemIds,
  getURLContent,
  isURL,
  extractBodyContent,
};
