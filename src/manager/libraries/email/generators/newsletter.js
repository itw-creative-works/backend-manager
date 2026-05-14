/**
 * Newsletter generator — pulls content from parent server and assembles a branded newsletter.
 *
 * Called by the daily pre-generation cron (and the iteration test) when a campaign has
 * `generator: 'newsletter'`. Produces a fully rendered email-safe HTML newsletter ready
 * to ship to Beehiiv / SendGrid.
 *
 * Pipeline:
 *   1. Read newsletter categories from Manager.config.marketing.beehiiv.content.categories
 *   2. Fetch ready sources from parent server (atomic claim via claimFor=brandId)
 *   3. structure.js → AI authors subject, preheader, intro, sections, signoff
 *   4. svg-illustrator.js → AI authors one SVG per section, rasterize to PNG
 *   5. mjml-template.js → compile MJML → email-safe HTML
 *   6. Persist PNGs (caller-provided via opts.persistImage or default no-op)
 *   7. Mark sources as used on parent server
 *
 * Returns { subject, preheader, content, contentHtml, structure, images } so the
 * marketing library can either send the HTML directly (contentHtml) or fall back to
 * the markdown pipeline (content) if needed.
 */
const fetch = require('wonderful-fetch');

const { filterSources } = require('./lib/filter.js');
const { generateStructure } = require('./lib/structure.js');
const { generateSectionImage } = require('./lib/svg-illustrator.js');
const { renderNewsletter } = require('./lib/mjml-template.js');
const { uploadAssets, RAW_BASE } = require('./lib/image-host.js');

/**
 * Generate newsletter content from parent server sources.
 *
 * @param {object} Manager - BEM Manager instance
 * @param {object} assistant - BEM assistant instance
 * @param {object} settings - Campaign settings from the recurring template
 * @param {object} [opts] - Optional overrides used by the iteration test
 * @param {function} [opts.persistImage] - async (image, idx) => imagePath (URL or relative path).
 *                                          When provided, takes precedence over imageHost — used by the
 *                                          iteration test to write PNGs locally for preview.
 * @param {'github'|'local'} [opts.imageHost] - Where to host images for the final HTML.
 *                                              Defaults to 'github' (uploads to itw-creative-works/newsletter-assets).
 *                                              Local skips upload — only useful if persistImage is also set.
 * @param {string} [opts.campaignId] - Stable ID used as the folder name in newsletter-assets.
 *                                     Defaults to the Firestore campaign doc ID if available.
 * @param {object[]} [opts.sources] - Pre-fetched sources (bypasses parent server claim)
 * @param {boolean} [opts.skipClaim] - Don't call PUT to mark sources as used
 * @param {boolean} [opts.skipImages] - Skip SVG/PNG generation (use placeholders)
 * @returns {object|null} Updated settings with content filled in, or null if unavailable
 */
async function generate(Manager, assistant, settings, opts = {}) {
  // Content pipeline config lives under the provider that publishes the result.
  // For newsletters, that's beehiiv (`marketing.beehiiv.content`). The whole
  // pipeline is gated by beehiiv.enabled — disabling beehiiv disables newsletter
  // generation as a side effect (correct, since there's nowhere for the
  // generated content to land).
  const beehiivConfig = Manager.config?.marketing?.beehiiv;
  const config = beehiivConfig?.content;

  if (!beehiivConfig?.enabled) {
    assistant.log('Newsletter generator: beehiiv disabled in config');
    return null;
  }

  if (!config) {
    assistant.log('Newsletter generator: no marketing.beehiiv.content config block');
    return null;
  }

  // Either use pre-fetched sources (iteration test) or fetch from parent
  let sources = opts.sources;

  if (!sources) {
    const categories = config.categories || [];

    if (!categories.length) {
      assistant.log('Newsletter generator: no categories configured');
      return null;
    }

    const parentUrl = Manager.config?.parent;

    if (!parentUrl) {
      assistant.log('Newsletter generator: no parent URL configured');
      return null;
    }

    const brandId = Manager.config?.brand?.id;
    sources = await fetchSources(parentUrl, categories, brandId, assistant);
  }

  if (!sources?.length) {
    assistant.log('Newsletter generator: no sources available');
    return null;
  }

  const brand = Manager.config?.brand;
  const ai = Manager.AI(assistant);
  const pipelineStart = Date.now();

  // 1. Filter — drop sources that don't fit the brand
  const { kept: filteredSources, scores, meta: filterMeta } = await filterSources({
    sources,
    brand,
    newsletterConfig: config,
    ai,
    assistant,
    threshold: opts.fitThreshold,
  });

  if (!filteredSources.length) {
    assistant.log('Newsletter generator: no sources passed brand-fit filter, skipping');
    return null;
  }

  assistant.log(`Newsletter generator: assembling from ${filteredSources.length} brand-fit sources (out of ${sources.length})`);

  // 2. Structure
  const structure = await generateStructure({
    sources: filteredSources,
    brand,
    newsletterConfig: config,
    ai,
    assistant,
  });

  assistant.log(`Newsletter generator: structure ready (${structure.sections.length} sections)`);

  // Asset hosting target — controls what URLs end up in <img src=...> AND
  // whether the rendered HTML gets uploaded too. Two values:
  //   - 'github': upload PNGs + newsletter.html to itw-creative-works/newsletter-assets,
  //               embed raw.githubusercontent.com URLs. The production cron path.
  //   - 'local':  use whatever persistImage returns (iteration test writes to disk).
  // Defaults to 'github' so production cron path "just works" without flag fiddling.
  const host = opts.imageHost || 'github';

  // campaignId — used as the GitHub folder name (and as the doc ID in production).
  // Resolution priority (most-specific first):
  //   1. opts.campaignId            — explicit override (test runs, cron paths)
  //   2. settings.id                — marketing-campaigns/{id} doc ID in production
  //   3. sources[0].id              — when exactly one source is being processed
  //                                   (iteration test pinning to a single source —
  //                                   means re-running against the same source
  //                                   overwrites the same folder, no churn)
  //   4. generatePushId()           — final fallback for ad-hoc runs with no anchor
  const campaignId = opts.campaignId
    || settings?.id
    || (sources.length === 1 ? sources[0].id : null)
    || generatePushId();

  // 2. SVG illustrations (parallel) + upload PNGs first so we have URLs
  //    available to embed in the HTML render below.
  let imagePaths = [];

  if (!opts.skipImages) {
    const images = await Promise.all(
      structure.sections.map((s) => generateSectionImage({
        imagePrompt: s.image_prompt,
        brand,
        newsletterConfig: config,
        ai,
        assistant,
      }))
    );

    // Run persistImage side-effects first (writes to disk, etc.). The local
    // paths it returns are used as a fallback if no host produces URLs.
    const persistedPaths = typeof opts.persistImage === 'function'
      ? await Promise.all(images.map((img, i) => opts.persistImage(img, i)))
      : null;

    if (host === 'github') {
      try {
        const { urls } = await uploadAssets({
          images,
          brandId: brand?.id,
          campaignId,
          subject: structure.subject,
          assistant,
        });
        imagePaths = urls;
      } catch (e) {
        assistant.error(`Newsletter generator: image upload failed — ${e.message}`);
        imagePaths = persistedPaths || images.map((_, i) => `about:blank#section-${i + 1}`);
      }
    } else {
      // 'local' — use persisted paths if available, else placeholder
      imagePaths = persistedPaths || images.map((_, i) => `about:blank#section-${i + 1}`);
    }

    assistant.log(`Newsletter generator: ${images.length} images rendered`);

    // Stash images on the return for callers that want to access raw buffers
    opts._lastImages = images;
  }

  // 3. MJML → HTML
  // Sponsorships precedence: opts.sponsorships > campaign settings.sponsorships > config.sponsorships
  const sponsorships = opts.sponsorships
    || settings?.sponsorships
    || config?.sponsorships
    || [];

  const { html, mjml } = await renderNewsletter({
    brand,
    newsletterConfig: config,
    structure,
    imagePaths,
    campaign: settings?.name || 'newsletter',
    sponsorships,
  });

  // 3b. Upload the rendered HTML to GitHub alongside the images. Lives in the
  //     same {brandId}/{campaignId}/ folder as newsletter.html. The folder URL
  //     becomes the canonical archive of the issue, browseable + downloadable.
  let assetsFolderUrl = null;
  let htmlUrl = null;

  if (host === 'github') {
    try {
      const upload = await uploadAssets({
        html,
        brandId: brand?.id,
        campaignId,
        subject: structure.subject,
        assistant,
      });
      assetsFolderUrl = upload.folderUrl;
      htmlUrl = upload.htmlUrl;
    } catch (e) {
      assistant.error(`Newsletter generator: HTML upload failed — ${e.message}`);
    }
  }

  // 3c. Upload to Beehiiv as a draft. Uses the same complete HTML with
  //     CDN image URLs already embedded. Today this will fail (Beehiiv's
  //     post-creation API requires Enterprise plan), but we ship it anyway
  //     so the day we upgrade to Enterprise it Just Works. Failure is logged,
  //     never thrown — the rest of the pipeline (GH archive, Firestore doc)
  //     succeeds regardless. beehiivConfig was already resolved at the top
  //     of the function for the initial enabled-check.
  let beehiivPostId = null;

  if (host === 'github' && beehiivConfig?.enabled) {
    try {
      const beehiivProvider = require('../providers/beehiiv.js');
      const result = await beehiivProvider.createPost({
        publicationId: beehiivConfig.publicationId,  // explicit — avoids singleton-Manager dependency
        title:         structure.subject,
        subject:       structure.subject,
        preheader:     structure.preheader,
        content:       html,
        status:        'draft',
      });

      if (result?.success && result.id) {
        beehiivPostId = result.id;
        assistant.log(`Newsletter generator: Beehiiv draft created — ${beehiivPostId}`);
      } else {
        // Expected today until Enterprise plan — log, do not throw.
        assistant.log(`Newsletter generator: Beehiiv draft upload skipped/failed — ${result?.error || 'unknown'}`);
      }
    } catch (e) {
      assistant.error(`Newsletter generator: Beehiiv draft upload threw — ${e.message}`);
    }
  }

  // 4. Mark sources as used on parent server (unless caller opted out)
  if (!opts.skipClaim) {
    const parentUrl = Manager.config?.parent;

    if (parentUrl) {
      await claimSources(parentUrl, sources, brand?.id, assistant);
    }
  }

  // Aggregate per-step metadata for telemetry / cost tracking
  const meta = {
    timestamp: new Date().toISOString(),
    totalDurationMs: Date.now() - pipelineStart,
    brand: { id: brand?.id, name: brand?.name },
    config: {
      categories: config.categories,
      tone: config.tone,
      template: config.template,
    },
    sources: {
      total: sources.length,
      filtered: filteredSources.length,
      scores,
    },
    steps: {
      filter: filterMeta || null,
      structure: structure._meta || null,
      images: (opts._lastImages || []).map((img, i) => ({
        section: i + 1,
        ...(img.meta || {}),
      })),
    },
    totals: aggregateTotals(filterMeta, structure._meta, opts._lastImages),
  };

  // Public asset URLs — stamped onto the generated campaign doc by the cron
  // so you can find the GitHub folder + downloadable HTML + image URLs without
  // re-deriving them. Null entries mean GitHub upload was skipped (local mode)
  // or failed (errors already logged above). beehiivPostId is the ID of the
  // draft post created on Beehiiv (or null if creation failed — expected until
  // we move off the free Beehiiv plan).
  const assets = host === 'github' ? {
    campaignId,
    folderUrl: assetsFolderUrl,
    htmlUrl,
    imageUrls: imagePaths,
    beehiivPostId,
  } : null;

  return {
    ...settings,
    subject: structure.subject,
    preheader: structure.preheader,
    content: '',          // legacy markdown field, unused when contentHtml is set
    contentHtml: html,    // pre-rendered email-safe HTML
    structure,            // structured copy for debugging / migration
    mjml,                 // raw MJML for debugging
    images: opts._lastImages || [],  // image buffers for the iteration test to persist locally
    assets,               // GitHub asset URLs (folder, html, images) — null in local mode
    meta,                 // per-step provider/model/cost/timing telemetry
  };
}

/**
 * Sum tokens + cost across all steps (filter, structure, all SVGs).
 */
function aggregateTotals(filterMeta, structureMeta, images) {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalCost = 0;
  let aiCalls = 0;

  const collect = (m) => {
    if (!m?.tokens) return;
    inputTokens += m.tokens.input?.count || 0;
    outputTokens += m.tokens.output?.count || 0;
    totalCost += m.tokens.total?.price || 0;
    aiCalls++;
  };

  collect(filterMeta);
  collect(structureMeta);

  for (const img of images || []) {
    collect(img.meta);
  }

  return {
    aiCalls,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    totalCostUSD: Number(totalCost.toFixed(4)),
  };
}

/**
 * Fetch ready newsletter sources from the parent server.
 */
async function fetchSources(parentUrl, categories, brandId, assistant) {
  const allSources = [];

  for (const category of categories) {
    try {
      const data = await fetch(`${parentUrl}/newsletter-sources`, {
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
      assistant.error(`Newsletter generator: Failed to fetch ${category} sources: ${e.message}`);
    }
  }

  return allSources;
}

/**
 * Mark sources as used on the parent server.
 */
async function claimSources(parentUrl, sources, brandId, assistant) {
  for (const source of sources) {
    try {
      await fetch(`${parentUrl}/newsletter-sources`, {
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
      assistant.error(`Newsletter generator: Failed to claim source ${source.id}: ${e.message}`);
    }
  }
}

/**
 * Generate a 20-character Firebase push ID (RTDB-style).
 *
 * Format: 20 chars, starts with a timestamp-encoded prefix, lexicographically
 * sortable by creation time. Matches the ID scheme used by Firebase Realtime
 * Database `.push()` and by ITW's `newsletter-sources/{id}`.
 *
 * Used when no real `marketing-campaigns/{id}` doc exists yet — typically only
 * the iteration test. Production cron passes the actual Firestore ID.
 *
 * Algorithm reference: https://gist.github.com/mikelehen/3596a30bd69384624c11
 */
let _lastPushTime = 0;
const _lastRandChars = [];
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

function generatePushId() {
  let now = Date.now();
  const duplicateTime = (now === _lastPushTime);
  _lastPushTime = now;

  const timeStampChars = new Array(8);
  for (let i = 7; i >= 0; i--) {
    timeStampChars[i] = PUSH_CHARS.charAt(now % 64);
    now = Math.floor(now / 64);
  }

  let id = timeStampChars.join('');

  if (!duplicateTime) {
    for (let i = 0; i < 12; i++) {
      _lastRandChars[i] = Math.floor(Math.random() * 64);
    }
  } else {
    // Increment to ensure monotonicity within the same millisecond
    let i = 11;
    for (; i >= 0 && _lastRandChars[i] === 63; i--) {
      _lastRandChars[i] = 0;
    }
    if (i >= 0) {
      _lastRandChars[i]++;
    }
  }

  for (let i = 0; i < 12; i++) {
    id += PUSH_CHARS.charAt(_lastRandChars[i]);
  }

  return id;
}

module.exports = { generate, fetchSources, claimSources, generatePushId };
