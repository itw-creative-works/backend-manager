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
 * Source picking, fallback hierarchy, Firestore dedup, and tracking live in
 * the shared source-resolver library — the SAME resolution the newsletter
 * generator uses. Per article, ONE random source is picked from the pool;
 * failures follow the type hierarchy ($feed → other feeds → $parent; $parent
 * → other parent items; NOTHING falls back to $brand).
 */
const powertools = require('node-powertools');
const moment = require('moment');

const {
  PROMPT_SOURCE,
  PROMPT,
  resolveSources,
  trackContentSource,
  getRecentTitles,
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
    entry.sources = entry.sources || [];
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
    assistant.log(`harvest(): Processing ${index + 1}/${entry.quantity}`);

    const allKnownTitles = [...recentTitles, ...runTitles];

    // ONE random source per article — fallback hierarchy handled by the resolver.
    // Tracking between iterations means the next resolve sees this run's usage.
    const [source] = await resolveSources({
      sources: entry.sources,
      count: 1,
      categories: entry.categories,
      admin,
      Manager,
      assistant,
    });

    if (!source) {
      assistant.log('harvest(): No source could be resolved for this article, skipping');
      continue;
    }

    const resolved = buildPromptFromSource(source, entry);

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

    assistant.log('harvest(): Resolved source', { type: source.type, title: source.title, url: source.url });

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
      source: source.trackingData?.url || null,
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
    if (source.trackingData?.itemTitle) {
      runTitles.push(source.trackingData.itemTitle);
    }

    // Mark the source used ONLY now that the article actually published.
    // $brand/url/text picks have no trackingData — synthesize one for $brand
    // so recent-title dedup still sees the post.
    const trackingData = source.trackingData || {
      url: uploadedPost.slug || `brand-${postId}`,
      origin: '$brand',
    };

    if (admin) {
      await trackContentSource(admin, {
        ...trackingData,
        usedBy: 'blog',
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

/**
 * Map a resolved source to the provider prompt shape.
 * feed/parent sources rewrite an existing article (PROMPT_SOURCE);
 * brand/url/text sources seed a fresh topic (PROMPT).
 *
 * @param {object} source - resolved source from resolveSources()
 * @param {object} entry - the blog content entry
 * @returns {{ description: string, sourceContent: string }}
 */
function buildPromptFromSource(source, entry) {
  const templateVars = {
    ...entry,
    instructions: entry.instructions,
    date: moment().format('MMMM YYYY'),
    tone: entry.tone || '',
    categories: (entry.categories || []).join(', '),
    keywords: (entry.keywords || []).join(', '),
  };

  if (source.type === 'feed' || source.type === 'parent') {
    return {
      description: powertools.template(PROMPT_SOURCE, {
        ...templateVars,
        sourceTitle: source.title,
      }),
      sourceContent: source.content || '',
    };
  }

  const suggestion = source.type === 'brand'
    ? 'Write an article about any topic that would be relevant to our website and business (it does not have to be about our company, but it can be)'
    : source.content;

  return {
    description: powertools.template(PROMPT, {
      ...templateVars,
      suggestion: suggestion,
    }),
    sourceContent: '',
  };
}

function randomize(array) {
  return array.sort(() => Math.random() - 0.5);
}
