/**
 * Ghostii Auto Publisher — daily cron job.
 *
 * Generates and publishes blog posts using the Ghostii AI article engine.
 * Iterates `config.ghostii[]` entries, each defining a source pool (generic
 * topics, URLs, text prompts, or RSS/Atom feeds) and per-entry overrides for
 * the Ghostii API params.
 *
 * Source types:
 *   '$app'              — generic brand-topic generation
 *   '$feed:<url>'       — RSS/Atom/JSON feed: pick one unprocessed article per run
 *   'https://...'       — fetch URL content as prompt seed
 *   '<text>'            — use directly as prompt seed
 *
 * Feed items are tracked in Firestore (`ghostii-feed-items`) so the same
 * article is never processed twice. When a feed is unreachable or exhausted,
 * the entry falls back to $app behavior.
 */
const crypto = require('crypto');
const fetch = require('wonderful-fetch');
const powertools = require('node-powertools');
const moment = require('moment');
const JSON5 = require('json5');

const { writeArticle, publishArticle } = require('../../../libraries/content/ghostii.js');
const { parseFeed, extractArticleContent } = require('../../../libraries/content/feed-parser.js');

const PROMPT = `
  Company: {brand.brand.name}: {brand.brand.description}
  Date: {date}
  Instructions: {prompt}

  Use the following information to find a topic for our company blog (it can be about our company OR any topic that would be relevant to our website and business BUT not about a competitor):
  {suggestion}
`;

const PROMPT_SOURCE = `
  Company: {brand.brand.name}: {brand.brand.description}
  Date: {date}
  Instructions: {prompt}

  Write an original article inspired by and referencing this source material.
  Do NOT copy the source — use it as context and inspiration for a unique take.
  Source title: {sourceTitle}
`;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const FEED_PREFIX = '$feed:';

// State
let postId;

/**
 * Ghostii Auto Publisher cron job
 *
 * Automatically generates and publishes blog posts using Ghostii AI.
 */
module.exports = async ({ Manager, assistant, context, libraries }) => {
  // Log
  assistant.log('Starting...');

  // Set post ID
  postId = moment().unix();

  // Build brand config from local config
  const brandConfig = buildBrandConfig(Manager.config);

  // Log
  assistant.log('Brand config', brandConfig);

  // Get settings
  const settingsArray = powertools.arrayify(Manager.config.ghostii);

  // Get admin for Firestore tracking
  const { admin } = libraries;

  // Loop through each item
  for (const settings of settingsArray) {
    // Fix settings
    settings.articles = settings.articles || 0;
    settings.sources = randomize(settings.sources || []);
    settings.links = randomize(settings.links || []);
    settings.prompt = settings.prompt || '';
    settings.chance = settings.chance || 1.0;
    settings.author = settings.author || undefined;
    settings.postPath = settings.postPath || 'ghostii';
    settings.overrides = settings.overrides || {};

    // Resolve brand data for this ghostii item
    if (settings.brand && settings.brandUrl) {
      // Cross-brand: fetch from the other project's /brand endpoint
      settings.brand = await fetchRemoteBrand(settings.brandUrl).catch((e) => e);

      if (settings.brand instanceof Error) {
        assistant.error('Error fetching remote brand data', settings.brand);
        continue;
      }
    } else {
      // Same-brand: use local config
      settings.brand = brandConfig;
    }

    // Log
    assistant.log(`Settings (brand=${settings.brand.brand.id})`, settings);

    // Quit if articles are disabled
    if (!settings.articles || !settings.sources.length) {
      assistant.log('Quitting because articles are disabled');
      continue;
    }

    // Quit if the chance is not met
    const chance = Math.random();
    if (chance > settings.chance) {
      assistant.log(`Quitting because the chance is not met (${chance} <= ${settings.chance})`);
      continue;
    }

    // Harvest articles
    const result = await harvest(assistant, settings, admin).catch((e) => e);
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

async function harvest(assistant, settings, admin) {
  const date = moment().format('MMMM YYYY');

  // Log
  assistant.log(`harvest(): Starting ${settings.brand.brand.id}...`);

  // Process the number of sources in the settings
  for (let index = 0; index < settings.articles; index++) {
    const source = powertools.random(settings.sources);

    // Log
    assistant.log(`harvest(): Processing ${index + 1}/${settings.articles}`, source);

    // Resolve the source into a prompt description + optional sourceContent
    const resolved = await resolveSource(assistant, source, settings, admin).catch((e) => e);
    if (resolved instanceof Error) {
      assistant.error('harvest(): Error resolving source', resolved);
      break;
    }

    // Log
    assistant.log('harvest(): Resolved source', resolved);

    // Request to Ghostii
    const article = await writeArticle({
      brand: settings.brand,
      description: resolved.description,
      links: settings.links,
      sourceContent: resolved.sourceContent || '',
      overrides: settings.overrides,
    }).catch((e) => e);
    if (article instanceof Error) {
      assistant.error('harvest(): Error requesting Ghostii', article);
      break;
    }

    // Log
    assistant.log('harvest(): Article', article);

    // Upload post to blog
    const uploadedPost = await publishArticle(assistant, {
      brand: settings.brand,
      article,
      id: postId++,
      author: settings.author,
      postPath: settings.postPath,
    }).catch((e) => e);
    if (uploadedPost instanceof Error) {
      assistant.error('harvest(): Error uploading post to blog', uploadedPost);
      break;
    }

    // Log
    assistant.log('harvest(): Uploaded post', uploadedPost);

    // Track feed item in Firestore (if this was a feed source)
    if (resolved.feedItem && admin) {
      await trackFeedItem(admin, {
        feedUrl: resolved.feedUrl,
        item: resolved.feedItem,
        brandId: settings.brand.brand.id,
        postUrl: uploadedPost.url,
        postSlug: uploadedPost.slug,
      }).catch((e) => {
        assistant.error('harvest(): Error tracking feed item (non-fatal)', e);
      });
    }
  }
}

/**
 * Resolve a source entry into { description, sourceContent, feedItem?, feedUrl? }.
 *
 * Source types:
 *   '$app'         — generic topic prompt, no sourceContent
 *   '$feed:<url>'  — RSS/Atom feed: pick unprocessed article, extract content
 *   URL            — fetch page content as prompt seed
 *   text           — use directly as prompt seed
 *
 * Feed failures fall back to $app behavior.
 */
async function resolveSource(assistant, source, settings, admin) {
  const date = moment().format('MMMM YYYY');

  // --- $feed: source ---
  if (typeof source === 'string' && source.startsWith(FEED_PREFIX)) {
    const feedUrl = source.slice(FEED_PREFIX.length);
    assistant.log(`resolveSource(): Processing feed: ${feedUrl}`);

    const feedResult = await processFeedSource(assistant, feedUrl, settings.brand.brand.id, admin).catch((e) => e);

    if (feedResult instanceof Error || !feedResult) {
      assistant.log('resolveSource(): Feed failed or exhausted, falling back to $app');
      return resolveSource(assistant, '$app', settings, admin);
    }

    const description = powertools.template(PROMPT_SOURCE, {
      ...settings,
      prompt: settings.prompt,
      date: date,
      sourceTitle: feedResult.item.title,
    });

    return {
      description,
      sourceContent: feedResult.content || feedResult.item.summary || '',
      feedItem: feedResult.item,
      feedUrl: feedUrl,
    };
  }

  // --- $app source ---
  if (source === '$app') {
    const suggestion = 'Write an article about any topic that would be relevant to our website and business (it does not have to be about our company, but it can be)';
    const description = powertools.template(PROMPT, {
      ...settings,
      prompt: settings.prompt,
      date: date,
      suggestion: suggestion,
    });

    return { description, sourceContent: '' };
  }

  // --- URL source ---
  if (isURL(source)) {
    const suggestion = await getURLContent(source).catch((e) => e);

    if (suggestion instanceof Error) {
      assistant.error(`resolveSource(): Error fetching URL ${source}`, suggestion);
      return resolveSource(assistant, '$app', settings, admin);
    }

    const description = powertools.template(PROMPT, {
      ...settings,
      prompt: settings.prompt,
      date: date,
      suggestion: suggestion,
    });

    return { description, sourceContent: '' };
  }

  // --- Text source ---
  const description = powertools.template(PROMPT, {
    ...settings,
    prompt: settings.prompt,
    date: date,
    suggestion: source,
  });

  return { description, sourceContent: '' };
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
    .collection('ghostii-feed-items')
    .where('feedUrl', '==', feedUrl)
    .select('itemId', 'itemUrl')
    .get();

  const ids = new Set();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.itemId) {
      ids.add(data.itemId);
    }
    if (data.itemUrl) {
      ids.add(data.itemUrl);
    }
  });

  return ids;
}

/**
 * Write a tracking doc for a processed feed item.
 *
 * @param {object} admin - Firebase Admin SDK
 * @param {object} args
 * @param {string} args.feedUrl - The source feed URL
 * @param {object} args.item - The processed feed item
 * @param {string} args.brandId - Brand that processed it
 * @param {string} args.postUrl - Published blog post URL
 * @param {string} args.postSlug - Published blog post slug
 */
async function trackFeedItem(admin, { feedUrl, item, brandId, postUrl, postSlug }) {
  const docId = feedItemHash(feedUrl, item.id || item.url);

  await admin.firestore().doc(`ghostii-feed-items/${docId}`).set({
    feedUrl: feedUrl,
    itemId: item.id || item.url,
    itemUrl: item.url,
    itemTitle: item.title,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    brandId: brandId,
    postUrl: postUrl || null,
    postSlug: postSlug || null,
    metadata: {
      created: admin.firestore.FieldValue.serverTimestamp(),
    },
  });
}

/**
 * Deterministic hash for a feed item — used as the Firestore doc ID.
 */
function feedItemHash(feedUrl, itemId) {
  return crypto.createHash('sha256').update(`${feedUrl}::${itemId}`).digest('hex').slice(0, 20);
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

module.exports.resolveSource = resolveSource;
module.exports.processFeedSource = processFeedSource;
module.exports.feedItemHash = feedItemHash;
module.exports.getProcessedItemIds = getProcessedItemIds;
module.exports.trackFeedItem = trackFeedItem;
module.exports.isURL = isURL;
