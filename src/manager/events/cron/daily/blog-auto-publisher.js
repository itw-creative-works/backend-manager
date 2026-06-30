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
 * exhausted, harvest() tries the next source in the pool. Only falls
 * back to $brand if '$brand' is explicitly listed in the entry's sources.
 *
 * Source resolution, tracking, and prompt constants live in the shared
 * source-resolver library (src/manager/libraries/content/source-resolver.js).
 */
const powertools = require('node-powertools');
const moment = require('moment');

const {
  PROMPT_SOURCE,
  PROMPT,
  FEED_PREFIX,
  processFeedSource,
  processParentSource,
  trackContentSource,
  contentSourceHash,
  getProcessedItemIds,
  getRecentTitles,
  getURLContent,
  isURL,
} = require('../../../libraries/content/source-resolver.js');

let postId;

module.exports = async ({ Manager, assistant, context, libraries }) => {
  if (!Manager.config.blog?.enabled) {
    assistant.log('Blog auto-publisher disabled in config');
    return;
  }

  assistant.log('Starting...');

  postId = moment().unix();

  const brandConfig = buildBrandConfig(Manager.config);
  assistant.log('Brand config', brandConfig);

  const blog = Manager.config.blog;
  const contentArray = powertools.arrayify(blog.content);
  const { admin } = libraries;

  const platform = blog.platform || 'ghostii';
  const provider = require(`../../../libraries/content/${platform}.js`);

  for (const entry of contentArray) {
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

    if (entry.brand && entry.brandUrl) {
      entry.brand = await fetchRemoteBrand(entry.brandUrl).catch((e) => e);
      if (entry.brand instanceof Error) {
        assistant.error('Error fetching remote brand data', entry.brand);
        continue;
      }
    } else {
      entry.brand = brandConfig;
    }

    assistant.log(`Entry (brand=${entry.brand.brand.id})`, entry);

    if (!entry.quantity || !entry.sources.length) {
      assistant.log('Quitting because quantity is 0 or no sources');
      continue;
    }

    const chance = Math.random();
    if (chance > entry.chance) {
      assistant.log(`Quitting because the chance is not met (${chance} <= ${entry.chance})`);
      continue;
    }

    const result = await harvest(assistant, entry, admin, provider, Manager).catch((e) => e);
    if (result instanceof Error) {
      throw result;
    }

    assistant.log('Finished!', result);
  }
};

function buildBrandConfig(config) {
  const { buildPublicConfig } = require(require('path').join(__dirname, '..', '..', '..', 'routes', 'brand', 'get.js'));
  return buildPublicConfig(config);
}

function fetchRemoteBrand(brandUrl) {
  const fetch = require('wonderful-fetch');
  return fetch(`${brandUrl}/backend-manager/brand`, {
    timeout: 120000,
    tries: 3,
    response: 'json',
  });
}

async function harvest(assistant, entry, admin, provider, Manager) {
  assistant.log(`harvest(): Starting ${entry.brand.brand.id}...`);

  const recentTitles = admin
    ? await getRecentTitles(admin, entry.brand.brand.id).catch((e) => {
        assistant.error('harvest(): Error fetching recent titles (continuing)', e);
        return [];
      })
    : [];
  const runTitles = [];

  if (recentTitles.length) {
    assistant.log(`harvest(): ${recentTitles.length} recent titles loaded for topic dedup`);
  }

  for (let index = 0; index < entry.quantity; index++) {
    const allKnownTitles = [...recentTitles, ...runTitles];

    let resolved = null;
    const shuffled = randomize([...entry.sources]);
    for (const source of shuffled) {
      assistant.log(`harvest(): Processing ${index + 1}/${entry.quantity}`, source);

      resolved = await resolveSource(assistant, source, entry, admin, Manager).catch((e) => {
        assistant.error('harvest(): Error resolving source', e);
        return null;
      });
      if (resolved) { break; }
    }

    if (!resolved) {
      assistant.log('harvest(): All sources exhausted for this article, skipping');
      continue;
    }

    if (allKnownTitles.length) {
      resolved.description += '\n\nTOPIC DEDUPLICATION (STRICT):\n'
        + 'These articles were RECENTLY published on our blog. You MUST NOT write about the same topic, theme, or subject area as ANY of them.\n'
        + 'Do NOT cover the same story from a different angle, do NOT write about the same theme with different examples, '
        + 'and do NOT reuse the same primary keyword/category combination. '
        + 'If a recent article covers "lifestyle tech + habits", do NOT write about "lifestyle tech + policy" — that is the SAME theme. '
        + 'Pick an entirely different domain.\n'
        + 'Recent articles:\n'
        + allKnownTitles.slice(0, 25).map((t) => `- ${t}`).join('\n');
    }

    assistant.log('harvest(): Resolved source', resolved);

    const overrides = { ...entry.overrides };
    if (!overrides.keywords && entry.keywords.length) {
      overrides.keywords = entry.keywords;
    }

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

    assistant.log('harvest(): Article', article);

    const post = provider.blocksToPost?.(article.json);
    const generatedTitle = post?.title || article.title || '';

    const publishArgs = {
      brand: entry.brand,
      article,
      id: postId++,
      author: entry.author,
      postPath: entry.postPath,
      source: resolved.trackingData?.url || null,
    };
    assistant.log('harvest(): publishArgs', publishArgs);

    const uploadedPost = await provider.publishArticle(assistant, publishArgs).catch((e) => e);
    if (uploadedPost instanceof Error) {
      assistant.error('harvest(): Error uploading post to blog', uploadedPost);
      break;
    }

    assistant.log('harvest(): Uploaded post', uploadedPost);

    if (generatedTitle) {
      runTitles.push(generatedTitle);
    }
    if (resolved.trackingData?.itemTitle) {
      runTitles.push(resolved.trackingData.itemTitle);
    }

    if (!resolved.trackingData) {
      resolved.trackingData = {
        url: uploadedPost.slug || `brand-${postId}`,
        origin: '$brand',
        usedBy: 'blog',
      };
    }

    if (admin) {
      await trackContentSource(admin, {
        ...resolved.trackingData,
        brandId: entry.brand.brand.id,
        postUrl: uploadedPost.url,
        postSlug: uploadedPost.slug,
        postTitle: generatedTitle || null,
      }).catch((e) => {
        assistant.error('harvest(): Error tracking content source (non-fatal)', e);
      });
    }
  }
}

async function resolveSource(assistant, source, entry, admin, Manager) {
  const date = moment().format('MMMM YYYY');

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
      assistant.log('resolveSource(): Feed failed or exhausted');
      if (entry.sources.includes('$brand')) {
        return resolveSource(assistant, '$brand', entry, admin, Manager);
      }
      return null;
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

    const parentResults = await processParentSource(assistant, entry, admin, Manager).catch((e) => e);

    if (parentResults instanceof Error || !parentResults?.length) {
      assistant.log('resolveSource(): Parent source failed or exhausted');
      if (entry.sources.includes('$brand')) {
        return resolveSource(assistant, '$brand', entry, admin, Manager);
      }
      return null;
    }

    const parentResult = parentResults[0];
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
      if (entry.sources.includes('$brand')) {
        return resolveSource(assistant, '$brand', entry, admin, Manager);
      }
      return null;
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

function randomize(array) {
  return array.sort(() => Math.random() - 0.5);
}

// Re-export shared functions for backwards compatibility (newsletter + tests import from here)
module.exports.resolveSource = resolveSource;
module.exports.processFeedSource = processFeedSource;
module.exports.contentSourceHash = contentSourceHash;
module.exports.getProcessedItemIds = getProcessedItemIds;
module.exports.trackContentSource = trackContentSource;
module.exports.isURL = isURL;
