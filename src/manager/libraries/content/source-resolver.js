/**
 * Shared content-source resolution for blog + newsletter pipelines.
 *
 * Both blog-auto-publisher and newsletter-generator resolve their sources
 * through the SAME function — resolveSources(). It:
 *   - Picks random source(s) from the entry's sources array (never anything
 *     outside the array)
 *   - Resolves each pick to a concrete item ($feed: article, $parent source,
 *     $brand seed, URL content, or text seed)
 *   - Checks Firestore (content-sources collection) so used items are never
 *     re-picked, and a session-used set so the same item is never returned
 *     twice in one call
 *   - Falls back on failure following a strict type hierarchy:
 *       $feed   → other items in the same feed → other $feed sources
 *                 → $parent (if listed) → give up
 *       $parent → other unused parent items → give up
 *       $brand  → pick-only; NOTHING ever falls back to $brand
 *       URL/text→ pick-only; no fallback in or out
 *   - Leaves marking-as-used to the CALLER (trackContentSource) so sources
 *     are only marked used after the content that used them actually
 *     generated/published successfully
 *
 * This module is the single source of truth for all of that.
 */
const crypto = require('crypto');
const fetch = require('wonderful-fetch');

const { parseFeed, extractArticleContent } = require('./feed-parser.js');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const FEED_PREFIX = '$feed:';
const CONTENT_SOURCES_COLLECTION = 'content-sources';

// Parent sources fetched per category when the $parent pool is built
const PARENT_SOURCES_PER_CATEGORY = 3;

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

// ── Resolver state ───────────────────────────────────────────────────

/**
 * Create the per-call resolver state. Caches parsed feeds and the parent
 * pool so a single resolveSources() call never fetches the same feed or
 * the parent endpoint twice.
 *
 * @param {object} args
 * @param {string[]} args.sources - The entry's source pool ($feed:/$parent/$brand/URL/text)
 * @param {string[]} [args.categories] - Categories for $parent fetches
 * @param {object} [args.admin] - firebase-admin (used-source checks; omit to skip)
 * @param {object} [args.Manager] - Manager instance (parent URL resolution)
 * @param {object} args.assistant - logger
 * @returns {object} state
 */
function createResolverState({ sources, categories, admin, Manager, assistant }) {
  return {
    pool: [...(sources || [])],
    categories: categories || [],
    admin,
    Manager,
    assistant,
    sessionUsed: new Set(),   // item url/id already returned this call
    feedCache: new Map(),     // feedUrl → { items: [...], dead: bool }
    parentPool: null,         // null = not fetched yet; [] = fetched (possibly exhausted)
  };
}

// ── Feed resolution ──────────────────────────────────────────────────

async function loadFeed(state, feedUrl) {
  if (state.feedCache.has(feedUrl)) {
    return state.feedCache.get(feedUrl);
  }

  const entry = { items: [], dead: false };
  state.feedCache.set(feedUrl, entry);

  const feedText = await fetch(feedUrl, {
    timeout: 30000,
    tries: 2,
    response: 'text',
    headers: { 'User-Agent': USER_AGENT },
  }).catch((e) => e);

  if (feedText instanceof Error) {
    state.assistant.error(`loadFeed(): Failed to fetch feed: ${feedUrl}`, feedText);
    entry.dead = true;
    return entry;
  }

  const { items } = parseFeed(feedText);
  if (!items.length) {
    state.assistant.log(`loadFeed(): No items in feed: ${feedUrl}`);
    entry.dead = true;
    return entry;
  }

  const processedIds = await getProcessedItemIds(state.admin, feedUrl).catch((e) => {
    state.assistant.error('loadFeed(): Error querying tracked items (continuing)', e);
    return new Set();
  });

  entry.items = items.filter((item) => !processedIds.has(item.id) && !processedIds.has(item.url));

  state.assistant.log(`loadFeed(): ${entry.items.length}/${items.length} unprocessed items in ${feedUrl}`);

  return entry;
}

async function resolveFeedItem(state, feedUrl) {
  const feed = await loadFeed(state, feedUrl);

  if (feed.dead) {
    return null;
  }

  // Newest-first among items not yet used this session
  const item = feed.items.find((i) => !state.sessionUsed.has(i.id) && !state.sessionUsed.has(i.url));
  if (!item) {
    state.assistant.log(`resolveFeedItem(): Feed exhausted for this session: ${feedUrl}`);
    return null;
  }

  state.sessionUsed.add(item.id);
  if (item.url) {
    state.sessionUsed.add(item.url);
  }

  let content = '';
  if (item.url) {
    content = await extractArticleContent(item.url).catch((e) => {
      state.assistant.error(`resolveFeedItem(): Failed to extract content from ${item.url} (using summary)`, e);
      return '';
    });
  }

  if (!content || content.length < 100) {
    content = item.content || item.summary || '';
  }

  return {
    type: 'feed',
    id: item.id || item.url || '',
    title: item.title || '',
    url: item.url || '',
    content,
    feedUrl,
    raw: item,
    trackingData: {
      url: item.url || item.id,
      origin: `${FEED_PREFIX}${feedUrl}`,
      feedUrl,
      itemId: item.id,
      itemTitle: item.title,
    },
  };
}

// ── Parent resolution ────────────────────────────────────────────────

async function loadParentPool(state) {
  if (state.parentPool !== null) {
    return state.parentPool;
  }

  state.parentPool = [];

  const parentUrl = state.Manager?.getParentApiUrl?.();
  if (!parentUrl) {
    state.assistant.log('loadParentPool(): No parent URL configured');
    return state.parentPool;
  }

  const categoriesToFetch = state.categories.length ? state.categories : [''];
  const fetched = [];

  for (const category of categoriesToFetch) {
    const query = {
      limit: PARENT_SOURCES_PER_CATEGORY,
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
      state.assistant.error(`loadParentPool(): Failed to fetch sources for category=${category}: ${e.message}`);
      return null;
    });

    if (data?.sources?.length) {
      fetched.push(...data.sources);
    }
  }

  // Dedupe across categories (same source can appear in multiple categories)
  const seen = new Set();
  const deduped = fetched.filter((s) => {
    const key = s.url || s.id;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  // Filter out sources already used (Firestore content-sources)
  let available = deduped;
  if (state.admin) {
    const usedUrls = new Set();
    const snapshot = await state.admin.firestore()
      .collection(CONTENT_SOURCES_COLLECTION)
      .where('origin', '==', '$parent')
      .select('url')
      .get()
      .catch((e) => {
        state.assistant.error('loadParentPool(): Error querying tracked sources (continuing)', e);
        return { docs: [] };
      });

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.url) {
        usedUrls.add(data.url);
      }
    });

    available = deduped.filter((s) => !usedUrls.has(s.url || s.id));
  }

  state.assistant.log(`loadParentPool(): ${available.length}/${fetched.length} parent sources available`);

  state.parentPool = available;
  return state.parentPool;
}

async function resolveParentItem(state) {
  const pool = await loadParentPool(state);

  const candidates = pool.filter((s) => {
    const key = s.url || s.id;
    return key && !state.sessionUsed.has(key);
  });

  if (!candidates.length) {
    state.assistant.log('resolveParentItem(): Parent pool exhausted for this session');
    return null;
  }

  // Random pick among remaining candidates
  const item = candidates[Math.floor(Math.random() * candidates.length)];
  state.sessionUsed.add(item.url || item.id);

  return {
    type: 'parent',
    id: item.id || '',
    title: item.title || item.subject || '',
    url: (item.url && item.url.startsWith('http')) ? item.url : '',
    content: item.source?.content || item.content || item.summary || '',
    raw: item,
    trackingData: {
      url: item.url || item.id,
      origin: '$parent',
      itemId: item.id,
      itemTitle: item.title || item.subject || '',
    },
  };
}

// ── Pick resolution (type-aware fallback) ────────────────────────────

/**
 * Resolve ONE picked source, following the fallback hierarchy for its type.
 * Exported for deterministic testing — production goes through resolveSources().
 *
 * @param {object} state - from createResolverState()
 * @param {string} source - the picked source ($feed:X / $parent / $brand / URL / text)
 * @returns {Promise<object|null>} resolved source or null when the chain is exhausted
 */
async function resolvePick(state, source) {
  // --- $feed: → same feed → other feeds → $parent (if listed) ---
  if (typeof source === 'string' && source.startsWith(FEED_PREFIX)) {
    const startUrl = source.slice(FEED_PREFIX.length);
    const otherFeeds = shuffle(
      state.pool
        .filter((s) => typeof s === 'string' && s.startsWith(FEED_PREFIX) && s !== source)
        .map((s) => s.slice(FEED_PREFIX.length))
    );

    for (const feedUrl of [startUrl, ...otherFeeds]) {
      const resolved = await resolveFeedItem(state, feedUrl);
      if (resolved) {
        return resolved;
      }
    }

    if (state.pool.includes('$parent')) {
      state.assistant.log('resolvePick(): All feeds exhausted, falling back to $parent');
      return resolveParentItem(state);
    }

    return null;
  }

  // --- $parent → other parent items only ---
  if (source === '$parent') {
    return resolveParentItem(state);
  }

  // --- $brand → pick-only seed (nothing ever falls back TO this) ---
  if (source === '$brand') {
    return {
      type: 'brand',
      id: '',
      title: '',
      url: '',
      content: '',
      raw: null,
      trackingData: null,
    };
  }

  // --- URL → fetch content, no fallback ---
  if (isURL(source)) {
    const content = await getURLContent(source).catch((e) => {
      state.assistant.error(`resolvePick(): Error fetching URL ${source}`, e);
      return null;
    });

    if (content === null) {
      return null;
    }

    return {
      type: 'url',
      id: source,
      title: '',
      url: source,
      content,
      raw: null,
      trackingData: null,
    };
  }

  // --- Text seed → always resolves ---
  return {
    type: 'text',
    id: '',
    title: '',
    url: '',
    content: source,
    raw: null,
    trackingData: null,
  };
}

// ── Main entry: resolve N sources from a pool ────────────────────────

/**
 * Resolve `count` sources from the entry's source pool.
 *
 * Each pick starts with a RANDOM source from the pool, then follows the
 * type fallback hierarchy (see module doc). Returns however many sources
 * could be resolved (may be fewer than count when pools are exhausted).
 *
 * The caller is responsible for marking returned sources as used via
 * trackContentSource(resolved.trackingData) AFTER the content that used
 * them succeeds.
 *
 * @param {object} args
 * @param {string[]} args.sources - The entry's source pool
 * @param {number} [args.count=1] - How many resolved sources to return
 * @param {string[]} [args.categories] - Categories for $parent fetches
 * @param {object} [args.admin] - firebase-admin
 * @param {object} [args.Manager]
 * @param {object} args.assistant
 * @returns {Promise<object[]>} resolved sources ({ type, id, title, url, content, feedUrl?, raw?, trackingData })
 */
async function resolveSources({ sources, count, categories, admin, Manager, assistant }) {
  count = count || 1;

  const state = createResolverState({ sources, categories, admin, Manager, assistant });

  if (!state.pool.length) {
    assistant.log('resolveSources(): Empty source pool');
    return [];
  }

  const resolved = [];

  for (let i = 0; i < count; i++) {
    const pick = state.pool[Math.floor(Math.random() * state.pool.length)];

    assistant.log(`resolveSources(): Pick ${i + 1}/${count} → ${typeof pick === 'string' ? pick.slice(0, 80) : pick}`);

    const result = await resolvePick(state, pick).catch((e) => {
      assistant.error('resolveSources(): Error resolving pick', e);
      return null;
    });

    if (result) {
      resolved.push(result);
    } else {
      assistant.log(`resolveSources(): Pick ${i + 1}/${count} exhausted its fallback chain`);
    }
  }

  assistant.log(`resolveSources(): Resolved ${resolved.length}/${count} sources`);

  return resolved;
}

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

// ── Firestore tracking ──────────────────────────────────────────────

async function trackContentSource(admin, { url, origin, feedUrl, itemId, itemTitle, usedBy, brandId, postUrl, postSlug, postTitle }) {
  const docId = contentSourceHash(origin || '', url || '');
  const nowISO = new Date().toISOString();
  const nowUNIX = Math.round(Date.now() / 1000);

  await admin.firestore().doc(`${CONTENT_SOURCES_COLLECTION}/${docId}`).set({
    url: url || null,
    origin: origin || null,
    feedUrl: feedUrl || null,
    itemId: itemId || null,
    itemTitle: itemTitle || null,
    postTitle: postTitle || null,
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

// ── Recent title loading (topic dedup) ───────────────────────────────

async function getRecentTitles(admin, brandId, days) {
  if (!admin) { return []; }

  days = days || 14;
  const cutoff = Math.round(Date.now() / 1000) - (days * 86400);

  const snapshot = await admin.firestore()
    .collection(CONTENT_SOURCES_COLLECTION)
    .where('brandId', '==', brandId)
    .select('postTitle', 'itemTitle', 'metadata')
    .get();

  const titles = new Set();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const created = data.metadata?.created?.timestampUNIX || 0;
    if (created < cutoff) { return; }

    if (data.postTitle) { titles.add(data.postTitle); }
    if (data.itemTitle) { titles.add(data.itemTitle); }
  });

  return [...titles];
}

// ── Exports ─────────────────────────────────────────────────────────

module.exports = {
  PROMPT_SOURCE,
  PROMPT,
  ANTI_TRACEABILITY,
  FEED_PREFIX,
  CONTENT_SOURCES_COLLECTION,
  USER_AGENT,
  resolveSources,
  createResolverState,
  resolvePick,
  trackContentSource,
  contentSourceHash,
  getProcessedItemIds,
  getRecentTitles,
  getURLContent,
  isURL,
  extractBodyContent,
};
