/**
 * Blog Auto Publisher — daily cron job.
 *
 * Generates and publishes blog posts using a provider-based article engine
 * (default: Ghostii). Iterates `config.blog.content[]` entries, each defining
 * a source pool (generic topics, URLs, text prompts, RSS/Atom feeds, or parent
 * server sources) and per-entry overrides for the provider API params.
 *
 * Source types:
 *   '$brand'            — generic brand-topic generation
 *   '$feed:<url>'       — RSS/Atom/JSON feed: pick one unprocessed article per run
 *   '$parent'           — fetch sources from parent server's source pool (without claiming)
 *   'https://...'       — fetch URL content as prompt seed
 *   '<text>'            — use directly as prompt seed
 *
 * All feed/parent sources are tracked in Firestore (`content-sources`) so the
 * same article is never processed twice. When a feed is unreachable or
 * exhausted, the entry falls back to $brand behavior.
 */
const crypto = require('crypto');
const fetch = require('wonderful-fetch');
const powertools = require('node-powertools');
const moment = require('moment');
const JSON5 = require('json5');

const { parseFeed, extractArticleContent } = require('../../../libraries/content/feed-parser.js');

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

const PROMPT_SOURCE = `
  Company: {brand.brand.name}: {brand.brand.description}
  Date: {date}
  Instructions: {instructions}
  Tone: {tone}
  Categories: {categories}
  Keywords: {keywords}

  Write an original article inspired by and referencing this source material.
  Do NOT copy the source — use it as context and inspiration for a unique take.
  Source title: {sourceTitle}
`;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const FEED_PREFIX = '$feed:';
const CONTENT_SOURCES_COLLECTION = 'content-sources';

// State
let postId;

/**
 * Blog Auto Publisher cron job
 *
 * Automatically generates and publishes blog posts using the configured platform provider.
 */
module.exports = async ({ Manager, assistant, context, libraries }) => {
  // Gate on blog.enabled
  if (!Manager.config.blog?.enabled) {
    assistant.log('Blog auto-publisher disabled in config');
    return;
  }

  // Log
  assistant.log('Starting...');

  // Set post ID
  postId = moment().unix();

  // Build brand config from local config
  const brandConfig = buildBrandConfig(Manager.config);

  // Log
  assistant.log('Brand config', brandConfig);

  // Get blog config
  const blog = Manager.config.blog;

  // Get content entries (array or single object)
  const contentArray = powertools.arrayify(blog.content);

  // Get admin for Firestore tracking
  const { admin } = libraries;

  // Load the provider based on blog.platform
  const platform = blog.platform || 'ghostii';
  const provider = require(`../../../libraries/content/${platform}.js`);

  // Loop through each content entry
  for (const entry of contentArray) {
    // Normalize entry fields
    entry.quantity = entry.quantity || 0;
    entry.sources = randomize(entry.sources || []);
    entry.links = randomize(entry.links || []);
    entry.instructions = entry.instructions || '';
    entry.tone = entry.tone || 'professional';
    entry.categories = entry.categories || [];
    entry.keywords = entry.keywords || [];
    entry.chance = entry.chance || 1.0;
    entry.author = entry.author || undefined;
    entry.postPath = entry.postPath || platform;
    entry.overrides = entry.overrides || {};

    // Resolve brand data for this entry
    if (entry.brand && entry.brandUrl) {
      // Cross-brand: fetch from the other project's /brand endpoint
      entry.brand = await fetchRemoteBrand(entry.brandUrl).catch((e) => e);

      if (entry.brand instanceof Error) {
        assistant.error('Error fetching remote brand data', entry.brand);
        continue;
      }
    } else {
      // Same-brand: use local config
      entry.brand = brandConfig;
    }

    // Log
    assistant.log(`Entry (brand=${entry.brand.brand.id})`, entry);

    // Quit if quantity is zero or no sources
    if (!entry.quantity || !entry.sources.length) {
      assistant.log('Quitting because quantity is 0 or no sources');
      continue;
    }

    // Quit if the chance is not met
    const chance = Math.random();
    if (chance > entry.chance) {
      assistant.log(`Quitting because the chance is not met (${chance} <= ${entry.chance})`);
      continue;
    }

    // Harvest articles
    const result = await harvest(assistant, entry, admin, provider, Manager).catch((e) => e);
    if (result instanceof Error) {
      throw result;
    }

    // Log
    assistant.log('Finished!', result);
  }
};

/**
 * Build brand config from Manager.config (same shape as /brand endpoint response)
 */
function buildBrandConfig(config) {
  const { buildPublicConfig } = require(require('path').join(__dirname, '..', '..', '..', 'routes', 'brand', 'get.js'));

  return buildPublicConfig(config);
}

/**
 * Fetch brand data from a remote BEM project's /brand endpoint
 */
function fetchRemoteBrand(brandUrl) {
  return fetch(`${brandUrl}/backend-manager/brand`, {
    timeout: 120000,
    tries: 3,
    response: 'json',
  });
}

async function harvest(assistant, entry, admin, provider, Manager) {
  const date = moment().format('MMMM YYYY');

  // Log
  assistant.log(`harvest(): Starting ${entry.brand.brand.id}...`);

  // Process the number of sources in the entry
  for (let index = 0; index < entry.quantity; index++) {
    const source = powertools.random(entry.sources);

    // Log
    assistant.log(`harvest(): Processing ${index + 1}/${entry.quantity}`, source);

    // Resolve the source into a prompt description + optional sourceContent
    const resolved = await resolveSource(assistant, source, entry, admin, Manager).catch((e) => e);
    if (resolved instanceof Error) {
      assistant.error('harvest(): Error resolving source', resolved);
      break;
    }

    // Log
    assistant.log('harvest(): Resolved source', resolved);

    // Use keywords from entry if overrides.keywords is not set
    const overrides = { ...entry.overrides };
    if (!overrides.keywords && entry.keywords.length) {
      overrides.keywords = entry.keywords;
    }

    // Request article from provider
    const article = await provider.writeArticle({
      brand: entry.brand,
      description: resolved.description,
      links: entry.links,
      sourceContent: resolved.sourceContent || '',
      overrides: overrides,
    }).catch((e) => e);
    if (article instanceof Error) {
      assistant.error('harvest(): Error requesting article from provider', article);
      break;
    }

    // Log
    assistant.log('harvest(): Article', article);

    // Upload post to blog
    const uploadedPost = await provider.publishArticle(assistant, {
      brand: entry.brand,
      article,
      id: postId++,
      author: entry.author,
      postPath: entry.postPath,
      source: resolved.trackingData?.url || null,
    }).catch((e) => e);
    if (uploadedPost instanceof Error) {
      assistant.error('harvest(): Error uploading post to blog', uploadedPost);
      break;
    }

    // Log
    assistant.log('harvest(): Uploaded post', uploadedPost);

    // Track content source in Firestore
    if (resolved.trackingData && admin) {
      await trackContentSource(admin, {
        ...resolved.trackingData,
        brandId: entry.brand.brand.id,
        postUrl: uploadedPost.url,
        postSlug: uploadedPost.slug,
      }).catch((e) => {
        assistant.error('harvest(): Error tracking content source (non-fatal)', e);
      });
    }
  }
}

/**
 * Resolve a source entry into { description, sourceContent, trackingData? }.
 *
 * Source types:
 *   '$brand'       — generic topic prompt, no sourceContent
 *   '$feed:<url>'  — RSS/Atom feed: pick unprocessed article, extract content
 *   '$parent'      — fetch sources from parent server without claiming
 *   URL            — fetch page content as prompt seed
 *   text           — use directly as prompt seed
 *
 * Feed/parent failures fall back to $brand behavior.
 */
async function resolveSource(assistant, source, entry, admin, Manager) {
  const date = moment().format('MMMM YYYY');

  // Build template vars for prompts
  const templateVars = {
    ...entry,
    instructions: entry.instructions,
    date: date,
    tone: entry.tone || '',
    categories: (entry.categories || []).join(', '),
    keywords: (entry.keywords || []).join(', '),
  };

  // --- $feed: source ---
  if (typeof source === 'string' && source.startsWith(FEED_PREFIX)) {
    const feedUrl = source.slice(FEED_PREFIX.length);
    assistant.log(`resolveSource(): Processing feed: ${feedUrl}`);

    const feedResult = await processFeedSource(assistant, feedUrl, entry.brand.brand.id, admin).catch((e) => e);

    if (feedResult instanceof Error || !feedResult) {
      assistant.log('resolveSource(): Feed failed or exhausted, falling back to $brand');
      return resolveSource(assistant, '$brand', entry, admin, Manager);
    }

    const description = powertools.template(PROMPT_SOURCE, {
      ...templateVars,
      sourceTitle: feedResult.item.title,
    });

    return {
      description,
      sourceContent: feedResult.content || feedResult.item.summary || '',
      trackingData: {
        url: feedResult.item.url || feedResult.item.id,
        origin: source,
        feedUrl: feedUrl,
        itemId: feedResult.item.id,
        itemTitle: feedResult.item.title,
        usedBy: 'blog',
      },
    };
  }

  // --- $parent source ---
  if (source === '$parent') {
    assistant.log('resolveSource(): Processing $parent source');

    const parentResult = await processParentSource(assistant, entry, admin, Manager).catch((e) => e);

    if (parentResult instanceof Error || !parentResult) {
      assistant.log('resolveSource(): Parent source failed or exhausted, falling back to $brand');
      return resolveSource(assistant, '$brand', entry, admin, Manager);
    }

    const description = powertools.template(PROMPT_SOURCE, {
      ...templateVars,
      sourceTitle: parentResult.title,
    });

    return {
      description,
      sourceContent: parentResult.content || parentResult.summary || '',
      trackingData: {
        url: parentResult.url || parentResult.id,
        origin: '$parent',
        itemId: parentResult.id,
        itemTitle: parentResult.title,
        usedBy: 'blog',
      },
    };
  }

  // --- $brand source ---
  if (source === '$brand') {
    const suggestion = 'Write an article about any topic that would be relevant to our website and business (it does not have to be about our company, but it can be)';
    const description = powertools.template(PROMPT, {
      ...templateVars,
      suggestion: suggestion,
    });

    return { description, sourceContent: '' };
  }

  // --- URL source ---
  if (isURL(source)) {
    const suggestion = await getURLContent(source).catch((e) => e);

    if (suggestion instanceof Error) {
      assistant.error(`resolveSource(): Error fetching URL ${source}`, suggestion);
      return resolveSource(assistant, '$brand', entry, admin, Manager);
    }

    const description = powertools.template(PROMPT, {
      ...templateVars,
      suggestion: suggestion,
    });

    return { description, sourceContent: '' };
  }

  // --- Text source ---
  const description = powertools.template(PROMPT, {
    ...templateVars,
    suggestion: source,
  });

  return { description, sourceContent: '' };
}

/**
 * Process a $parent source — fetch sources from the parent server without claiming.
 *
 * Fetches available sources via GET /newsletter-sources (no claimFor parameter),
 * filters out any already tracked locally in `content-sources`, and returns
 * the first available source.
 *
 * @param {object} assistant - BEM assistant
 * @param {object} entry - Content entry config
 * @param {object} admin - Firebase Admin SDK
 * @param {object} Manager - BEM Manager instance
 * @returns {Promise<{ id, title, url, content, summary }|null>} Selected source or null
 */
async function processParentSource(assistant, entry, admin, Manager) {
  const parentUrl = Manager?.getParentApiUrl?.();

  if (!parentUrl) {
    assistant.log('processParentSource(): No parent URL configured');
    return null;
  }

  const categories = entry.categories || [];
  const allSources = [];

  // Fetch sources from each category (or all if no categories)
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

  // Filter out already-used sources by checking content-sources collection locally
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

    return available[0];
  }

  // No admin — just return the first source
  return allSources[0];
}

/**
 * Process a $feed: source — fetch, parse, select unprocessed item, extract content.
 *
 * @param {object} assistant - BEM assistant
 * @param {string} feedUrl - RSS/Atom/JSON feed URL
 * @param {string} brandId - Brand ID for tracking
 * @param {object} admin - Firebase Admin SDK
 * @returns {Promise<{ item: FeedItem, content: string }|null>} Selected item + extracted content, or null
 */
async function processFeedSource(assistant, feedUrl, brandId, admin) {
  // Fetch the feed
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

  // Parse the feed
  const { items } = parseFeed(feedText);
  if (!items.length) {
    assistant.log(`processFeedSource(): No items in feed: ${feedUrl}`);
    return null;
  }

  assistant.log(`processFeedSource(): Parsed ${items.length} items from feed`);

  // Get already-processed item IDs from Firestore
  const processedIds = await getProcessedItemIds(admin, feedUrl).catch((e) => {
    assistant.error('processFeedSource(): Error querying tracked items (continuing)', e);
    return new Set();
  });

  // Filter to unprocessed items
  const unprocessed = items.filter((item) => !processedIds.has(item.id) && !processedIds.has(item.url));
  if (!unprocessed.length) {
    assistant.log(`processFeedSource(): All ${items.length} items already processed for: ${feedUrl}`);
    return null;
  }

  assistant.log(`processFeedSource(): ${unprocessed.length} unprocessed items available`);

  // Pick the first (newest) unprocessed item
  const item = unprocessed[0];

  // Extract full article content from the item URL
  let content = '';
  if (item.url) {
    content = await extractArticleContent(item.url).catch((e) => {
      assistant.error(`processFeedSource(): Failed to extract content from ${item.url} (using summary)`, e);
      return '';
    });
  }

  // Fall back to inline feed content or summary
  if (!content || content.length < 100) {
    content = item.content || item.summary || '';
  }

  return { item, content };
}

/**
 * Query Firestore for already-processed feed item IDs.
 *
 * @param {object} admin - Firebase Admin SDK
 * @param {string} feedUrl - The feed URL to query
 * @returns {Promise<Set<string>>} Set of processed item IDs
 */
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

/**
 * Write a tracking doc for a processed content source.
 *
 * Unified tracker for all source types (feed, parent, brand).
 * Used by both blog-auto-publisher and newsletter generator.
 *
 * @param {object} admin - Firebase Admin SDK
 * @param {object} args
 * @param {string} args.url - Unique identifier (article URL or source ID)
 * @param {string} args.origin - Source type ('$feed:https://...', '$parent', '$brand')
 * @param {string} [args.feedUrl] - The source feed URL (for feed sources)
 * @param {string} [args.itemId] - Item ID within the feed
 * @param {string} [args.itemTitle] - Item title
 * @param {string} args.usedBy - Which system used it ('blog' or 'newsletter')
 * @param {string} args.brandId - Brand that processed it
 * @param {string} [args.postUrl] - Published blog post URL
 * @param {string} [args.postSlug] - Published blog post slug
 */
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

/**
 * Deterministic hash for a content source — used as the Firestore doc ID.
 */
function contentSourceHash(origin, url) {
  return crypto.createHash('sha256').update(`${origin}::${url}`).digest('hex').slice(0, 20);
}

function getURLContent(url) {
  return fetch(url, {
    timeout: 120000,
    tries: 3,
    response: 'raw',
    headers: {
      'User-Agent': USER_AGENT,
    },
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

function extractBodyContent(text, contentType, url) {
  const parsed = tryParse(text);

  // Try JSON
  if (parsed) {
    // If it's from rss.app, extract the content
    if (parsed.items) {
      return parsed.items.map((i) => `${i.title}: ${i.content_text}`).join('\n');
    }

    // If we can't recognize the JSON, return the original text
    return text;
  }

  // Extract the content within the body tag
  const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) {
    return '';
  }

  let bodyContent = bodyMatch[1];

  // Remove script and meta tags
  bodyContent = bodyContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  bodyContent = bodyContent.replace(/<meta[^>]*>/gi, '');

  // Remove remaining HTML tags
  return bodyContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tryParse(json) {
  try {
    return JSON5.parse(json);
  } catch (e) {
    return null;
  }
}

function randomize(array) {
  return array.sort(() => Math.random() - 0.5);
}

// Exported for testing and for newsletter to import
module.exports.resolveSource = resolveSource;
module.exports.processFeedSource = processFeedSource;
module.exports.contentSourceHash = contentSourceHash;
module.exports.getProcessedItemIds = getProcessedItemIds;
module.exports.trackContentSource = trackContentSource;
module.exports.isURL = isURL;
