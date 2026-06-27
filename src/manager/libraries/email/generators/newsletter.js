/**
 * Newsletter generator — pulls content from parent server and assembles a branded newsletter.
 *
 * Called by the daily pre-generation cron (and the iteration test) when a campaign has
 * `generator: 'newsletter'`. Produces a fully rendered email-safe HTML newsletter ready
 * to ship to Beehiiv / SendGrid.
 *
 * Pipeline:
 *   1. Read newsletter categories from Manager.config.marketing.newsletter.content.categories
 *   2. Fetch ready sources from parent server (no claiming — child tracks locally)
 *   3. structure.js → AI authors subject, preheader, intro, sections, signoff
 *   4. image-illustrator.js → AI generates one flat-vector PNG per section via
 *      gpt-image-2 (default). Set content.method.image = 'svg' to use the legacy
 *      svg-illustrator.js (AI writes an <svg>, resvg rasterizes it) instead.
 *   5. mjml-template.js → compile MJML → email-safe HTML
 *   6. Persist PNGs (caller-provided via opts.persistImage or default no-op)
 *   7. Mark sources as used on parent server
 *
 * Returns { subject, preheader, content, contentHtml, structure, images } so the
 * marketing library can either send the HTML directly (contentHtml) or fall back to
 * the markdown pipeline (content) if needed.
 */
const fetch = require('wonderful-fetch');
const powertools = require('node-powertools');

const { filterSources } = require('./lib/filter.js');
const { generateStructure } = require('./lib/structure.js');
const { generateSectionImage: generateImageSection } = require('./lib/image-illustrator.js');
const { generateSectionImage: generateSvgSection } = require('./lib/svg-illustrator.js');
const { renderNewsletter } = require('./lib/mjml-template.js');

// Default illustration method. 'image' = gpt-image-2 flat-vector PNGs (default).
// 'svg' = legacy AI-authored SVG rasterized via resvg. Selected per-brand via
// marketing.newsletter.content.method.image.
const DEFAULT_IMAGE_METHOD = 'image';

function resolveSectionImageFn(newsletterConfig) {
  const method = newsletterConfig?.method?.image || DEFAULT_IMAGE_METHOD;
  return method === 'svg' ? generateSvgSection : generateImageSection;
}
const { renderMarkdown } = require('./lib/markdown-renderer.js');
const { uploadAssets, RAW_BASE } = require('./lib/image-host.js');
const { buildPublicConfig } = require('../../../routes/brand/get.js');
const { writeArticle, publishArticle } = require('../../../libraries/content/ghostii.js');
const { trackContentSource, contentSourceHash, resolveNewsletterSources } = require('../../../libraries/content/source-resolver.js');

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
 * @param {boolean} [opts.publishArticle] - When the linked-article build runs (config.article.enabled),
 *                                          actually COMMIT the post to the website repo via admin/post.
 *                                          When false (default), the article is still generated and its
 *                                          URL computed + injected as the CTA, but nothing is committed.
 *                                          Production cron passes true; the iteration test leaves it false.
 * @returns {object|null} Updated settings with content filled in, or null if unavailable
 */
async function generate(Manager, assistant, settings, opts = {}) {
  const newsletterRoleConfig = Manager.config?.marketing?.newsletter;
  const rawContent = newsletterRoleConfig?.content;

  if (!newsletterRoleConfig?.enabled) {
    assistant.log('Newsletter generator: newsletter disabled in config');
    return null;
  }

  if (!rawContent) {
    assistant.log('Newsletter generator: no marketing.newsletter.content config block');
    return null;
  }

  // Content can be an array or single object (matches blog config shape)
  const contentArray = powertools.arrayify(rawContent);
  const config = contentArray[0];

  if (!config) {
    assistant.log('Newsletter generator: empty content array');
    return null;
  }

  // Default sources to ['$parent'] if not specified
  const contentSources = config.sources || ['$parent'];

  // Either use pre-fetched sources (iteration test) or resolve from config
  let sources = opts.sources;

  if (!sources) {
    const categories = config.categories || [];

    if (!categories.length) {
      assistant.log('Newsletter generator: no categories configured');
      return null;
    }

    const admin = Manager.libraries?.admin;

    sources = await resolveNewsletterSources({
      sources: contentSources,
      categories,
      admin,
      Manager,
      assistant,
    });
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

  // 2. SVG illustrations + (optional) linked blog article — run CONCURRENTLY.
  //    Both are slow AI calls. The image build produces the section image URLs;
  //    the article build expands the lead section into a full blog post and
  //    returns its public URL, which we inject as a "Read more" CTA before render.
  let imagePaths = [];

  const buildImages = async () => {
    if (opts.skipImages) {
      return;
    }

    const generateSectionImage = resolveSectionImageFn(config);
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
  };

  // The linked-article build is gated by config.article.enabled and needs a lead
  // section to expand. Wrapped so a failure here NEVER blocks the newsletter —
  // it resolves to null and the CTA simply isn't injected.
  //
  // Two phases, independently controllable:
  //   - GENERATE: always runs when article.enabled is on. Calls Ghostii to write
  //     the article + hero image and computes the public URL it WOULD live at.
  //   - PUBLISH:  commits the post to the website repo via admin/post. Only when
  //     opts.publishArticle is true. The production cron passes true; the
  //     iteration test leaves it false (so it exercises generation without
  //     committing a real post) unless NEWSLETTER_CREATE_ARTICLE=1 is set.
  //
  // The CTA URL is derived from the article title (same slugify admin/post uses),
  // so the newsletter links correctly even in generate-only mode.
  const wantArticle = !!config.article?.enabled
    && Array.isArray(structure.sections)
    && structure.sections.length > 0;

  const buildArticle = async () => {
    if (!wantArticle) {
      return null;
    }

    return buildLinkedArticle({
      Manager,
      assistant,
      brand,
      config,
      structure,
      publish: !!opts.publishArticle,
    }).catch((e) => {
      assistant.error(`Newsletter generator: linked article failed — ${e.message}`);
      return null;
    });
  };

  const [, articleResult] = await Promise.all([buildImages(), buildArticle()]);

  // Inject the "Read the full article" CTA onto the lead section BEFORE render.
  // sectionCard (MJML) renders section.cta = { label, url } automatically; the
  // markdown renderer emits it too. The URL is the post's public blog URL —
  // present whether the article was actually published or only generated
  // (derived from the title slug), so the newsletter links correctly either way.
  if (articleResult?.url) {
    structure.sections[0].cta = { label: 'Read the full article', url: articleResult.url };
    assistant.log(`Newsletter generator: linked article ${articleResult.published ? 'published' : 'generated (not published)'} — ${articleResult.url}`);
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

  // 3a. Programmatic markdown view — same `structure`, walked by code (no AI).
  //     The markdown is split into ## blocks per section so it can be pasted
  //     into Beehiiv's block editor with ad blocks inserted between dispatches.
  //     `summary` is a separate short editorial recap, written by the AI
  //     during the structure step.
  const markdown = renderMarkdown({
    structure,
    brand,
    imagePaths,
    sponsorships,
  });

  const summaryText = (structure.summary || '').trim();

  // 3b. Upload the rendered HTML + markdown + summary to GitHub alongside the
  //     images. All four kinds live in the same {brandId}/{campaignId}/ folder.
  //     The folder URL becomes the canonical archive of the issue.
  let assetsFolderUrl = null;
  let htmlUrl = null;
  let previewUrl = null;
  let markdownUrl = null;
  let summaryUrl = null;

  if (host === 'github') {
    try {
      const upload = await uploadAssets({
        html,
        markdown,
        summary: summaryText || undefined,
        brandId: brand?.id,
        campaignId,
        subject: structure.subject,
        assistant,
      });
      assetsFolderUrl = upload.folderUrl;
      htmlUrl = upload.htmlUrl;
      previewUrl = upload.previewUrl || null;
      markdownUrl = upload.markdownUrl || null;
      summaryUrl = upload.summaryUrl || null;
    } catch (e) {
      assistant.error(`Newsletter generator: HTML upload failed — ${e.message}`);
    }
  }

  // 3c. Upload to Beehiiv as a draft. Uses the same complete HTML with
  //     CDN image URLs already embedded. Today this will fail (Beehiiv's
  //     post-creation API requires Enterprise plan), but we ship it anyway
  //     so the day we upgrade to Enterprise it Just Works. Failure is logged,
  //     never thrown — the rest of the pipeline (GH archive, Firestore doc)
  //     succeeds regardless. newsletterRoleConfig was already resolved at the top
  //     of the function for the initial enabled-check.
  let beehiivPostId = null;
  let beehiivFailureReason = null;

  if (host === 'github' && newsletterRoleConfig?.enabled) {
    try {
      const beehiivProvider = require('../providers/beehiiv.js');
      const result = await beehiivProvider.createPost({
        publicationId: newsletterRoleConfig.publicationId,  // explicit — avoids singleton-Manager dependency
        title:         structure.subject,
        subject:       structure.subject,
        preheader:     structure.preheader,
        content:       html,
        contentTags:   Array.isArray(structure.tags) ? structure.tags : [],
        status:        'draft',
      });

      if (result?.success && result.id) {
        beehiivPostId = result.id;
        assistant.log(`Newsletter generator: Beehiiv draft created — ${beehiivPostId}`);
      } else {
        // Expected today until Enterprise plan — log, do not throw.
        beehiivFailureReason = result?.error || 'unknown error';
        assistant.log(`Newsletter generator: Beehiiv draft upload skipped/failed — ${beehiivFailureReason}`);
      }
    } catch (e) {
      beehiivFailureReason = e.message;
      assistant.error(`Newsletter generator: Beehiiv draft upload threw — ${e.message}`);
    }
  }

  // 3d. Fallback alert email — sent to the brand's internal alerts inbox when
  //     Beehiiv draft creation fails. The newsletter is fully generated and
  //     archived to GitHub at this point, so the email contains everything
  //     needed for a human to manually upload to Beehiiv: HTML URL (one-shot
  //     paste), markdown URL (per-section blocks for ad insertion), summary
  //     URL, and the tags to set. Failure of THIS email is logged but never
  //     blocks the cron — the campaign doc is still written either way.
  if (beehiivFailureReason && htmlUrl) {
    await sendBeehiivFallbackEmail(Manager, assistant, {
      brand,
      subject: structure.subject,
      preheader: structure.preheader,
      tags: Array.isArray(structure.tags) ? structure.tags : [],
      htmlUrl,
      previewUrl,
      markdownUrl,
      summaryUrl,
      folderUrl: assetsFolderUrl,
      reason: beehiivFailureReason,
    });
  }

  // 4. Track all sources in the unified content-sources collection
  const admin = Manager.libraries?.admin;
  if (admin) {
    for (const source of sources) {
      const origin = source.source?.from?.startsWith?.('http') ? `$feed:${source.source.from}` : '$parent';
      await trackContentSource(admin, {
        url: source.url || source.id,
        origin,
        feedUrl: origin.startsWith('$feed:') ? origin.slice(6) : undefined,
        itemId: source.id,
        itemTitle: source.title || '',
        usedBy: 'newsletter',
        brandId: brand?.id || '',
      }).catch((e) => {
        assistant.error(`Newsletter generator: Error tracking content source (non-fatal): ${e.message}`);
      });
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
    // Linked blog article (when config.article.enabled is on). null if disabled or failed.
    // `published` is false when the article was generated but not committed (e.g. test mode).
    article: articleResult
      ? { url: articleResult.url, slug: articleResult.slug, path: articleResult.path, published: !!articleResult.published }
      : null,
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
    previewUrl,
    markdownUrl,
    summaryUrl,
    imageUrls: imagePaths,
    beehiivPostId,
    articleUrl: articleResult?.url || null,  // linked blog post (config.article.enabled), null otherwise
    tags: Array.isArray(structure.tags) ? structure.tags : [],
  } : null;

  return {
    ...settings,
    subject: structure.subject,
    preheader: structure.preheader,
    content: '',          // legacy markdown field, unused when contentHtml is set
    contentHtml: html,    // pre-rendered email-safe HTML
    contentMarkdown: markdown,  // programmatic markdown view (per-section blocks for Beehiiv paste)
    summary: summaryText, // editorial recap (separate from preheader)
    tags: Array.isArray(structure.tags) ? structure.tags : [],
    structure,            // structured copy for debugging / migration
    mjml,                 // raw MJML for debugging
    images: opts._lastImages || [],  // image buffers for the iteration test to persist locally
    assets,               // GitHub asset URLs (folder, html, md, summary, images) — null in local mode
    meta,                 // per-step provider/model/cost/timing telemetry
    article: articleResult || null,  // full linked-article result { url, slug, path, published, article: {title, body, headerImageUrl, ...} } — null when disabled/failed
  };
}

/**
 * Expand the newsletter's lead section into a full blog article via Ghostii and
 * (optionally) publish it to the brand's website repo. Returns the post's public
 * URL so the newsletter can link to it via a "Read the full article" CTA.
 *
 * The lead section (structure.sections[0]) is the same topic the newsletter
 * leads with, so the resulting article is the long-form version.
 *
 * Two phases:
 *   - GENERATE (always): Ghostii writes the article + hero image. We then compute
 *     the public URL the post WOULD live at, using the same title→slug rule
 *     admin/post applies. This URL is valid for the CTA whether or not we publish.
 *   - PUBLISH (only when `publish`): commit the post to the website repo via
 *     admin/post (GitHub). When `publish` is false, nothing is committed.
 *
 * Gated upstream by config.article.enabled. Any failure is caught by the caller
 * and the CTA is simply omitted — the newsletter never depends on this.
 *
 * @param {object} args
 * @param {object} args.Manager
 * @param {object} args.assistant
 * @param {object} args.brand - { id, name, url, ... }
 * @param {object} args.config - marketing.newsletter.content (tone, instructions, article.author)
 * @param {object} args.structure - newsletter structure (sections[0] is the lead)
 * @param {boolean} [args.publish] - Commit the post to GitHub via admin/post. Default false.
 * @returns {Promise<{url, slug, path, published}|null>}
 */
async function buildLinkedArticle({ Manager, assistant, brand, config, structure, publish }) {
  const lead = structure.sections[0] || {};
  const publicConfig = buildPublicConfig(Manager.config);

  // Build the article brief from the lead section, folded with the shared
  // editorial steer (tone + instructions) so the blog post matches the
  // newsletter's voice. Ghostii expands this into a full article + hero image.
  const briefLines = [
    `Company: ${brand?.name || ''}: ${brand?.description || ''}`,
    config?.tone ? `Tone: ${config.tone}` : '',
    config?.instructions ? `Instructions: ${config.instructions}` : '',
    '',
    `Write a full blog article expanding on this topic:`,
    `Title: ${lead.title || ''}`,
    `Summary: ${lead.body || ''}`,
  ].filter(Boolean).join('\n');

  assistant.log(`Newsletter generator: building linked article for "${lead.title}"`);

  // Phase 1 — GENERATE (always)
  const article = await writeArticle({
    brand: publicConfig,
    description: briefLines,
  });

  // Compute the public URL the post WOULD live at. admin/post slugifies the
  // title (after stripping a `blog/` prefix that titles never have), so we
  // mirror that here to derive the same slug without needing to publish.
  const slug = Manager.Utilities().slugify(article.title || '');
  const url = slug
    ? `${(publicConfig.brand?.url || '').replace(/\/$/, '')}/blog/${slug}`
    : null;

  // Phase 2 — PUBLISH (gated). Commit to the website repo only when asked.
  if (!publish) {
    assistant.log(`Newsletter generator: article generated but NOT published (publish=false) — would live at ${url}`);
    return { url, slug, path: null, published: false, article };
  }

  const result = await publishArticle(assistant, {
    brand: publicConfig,
    article,
    id: Math.round(Date.now() / 1000),
    author: config?.article?.author,
    postPath: 'newsletter',
  });

  return { url: result.url || url, slug: result.slug || slug, path: result.path, published: true, article };
}

/**
 * Send an internal alert email when Beehiiv draft creation fails so the
 * brand team knows there's a ready newsletter waiting for manual upload.
 *
 * Uses `sender: 'internal'` which auto-resolves to `alerts@{brandDomain}` via
 * the SENDERS table in email/constants.js. Recipient is the same alerts@
 * address — a self-addressed operational alert, no human inbox involved.
 *
 * Errors here are logged but never thrown — the alert is best-effort. If
 * brand.url is unset, the email is skipped entirely.
 *
 * @param {object} Manager
 * @param {object} assistant
 * @param {object} args
 * @param {object} args.brand
 * @param {string} args.subject - The newsletter's subject (used in the alert subject)
 * @param {string} args.preheader
 * @param {string[]} args.tags
 * @param {string} args.htmlUrl - GitHub raw URL to the fully-rendered HTML
 * @param {string} [args.markdownUrl] - GitHub raw URL to the per-section markdown
 * @param {string} [args.previewUrl] - GitHub Pages URL for browser-rendered HTML preview
 * @param {string} [args.summaryUrl] - GitHub raw URL to the 2-3 sentence summary
 * @param {string} [args.folderUrl] - GitHub folder URL (browseable archive)
 * @param {string} args.reason - Why Beehiiv upload failed (API error message)
 */
async function sendBeehiivFallbackEmail(Manager, assistant, args) {
  // Send TO and FROM the same internal alerts inbox — alerts@{brandDomain}.
  // The `sender: 'internal'` SENDERS entry already resolves the FROM address
  // to this; we mirror the same domain for the TO so it's a self-addressed
  // operational alert (no human inbox involved).
  const brandDomain = Manager.config?.brand?.contact?.email?.split('@')[1];

  if (!brandDomain) {
    assistant.log('Newsletter generator: Beehiiv fallback email skipped — no brand.contact.email');
    return;
  }

  const alertsEmail = `alerts@${brandDomain}`;

  try {
    const email = Manager.Email(assistant);
    const messageLines = [];

    messageLines.push(`<strong>Beehiiv draft creation failed</strong> — the newsletter is generated and archived, but needs to be manually uploaded to Beehiiv.`);
    messageLines.push('');
    messageLines.push(`<strong>Failure reason:</strong> ${args.reason}`);
    messageLines.push('');
    messageLines.push('<strong>Newsletter details:</strong>');
    messageLines.push('<ul>');
    messageLines.push(`<li><strong>Subject:</strong> ${args.subject}</li>`);
    messageLines.push(`<li><strong>Preheader:</strong> ${args.preheader || '(none)'}</li>`);
    if (args.tags?.length) {
      messageLines.push(`<li><strong>Tags:</strong> ${args.tags.join(', ')}</li>`);
    }
    messageLines.push('</ul>');
    messageLines.push('');
    messageLines.push('<strong>Assets:</strong>');
    messageLines.push('<ul>');
    messageLines.push('<li><strong>Full HTML</strong> (one-shot paste into Beehiiv)');
    messageLines.push('<ul>');
    if (args.previewUrl) {
      messageLines.push(`<li><a href="${args.previewUrl}">Preview in browser</a></li>`);
    }
    messageLines.push(`<li><a href="${args.htmlUrl}">View raw HTML</a></li>`);
    messageLines.push('</ul>');
    messageLines.push('</li>');
    if (args.markdownUrl) {
      messageLines.push(`<li><a href="${args.markdownUrl}"><strong>Per-section markdown</strong></a> — paste as separate blocks, ads between</li>`);
    }
    if (args.summaryUrl) {
      messageLines.push(`<li><a href="${args.summaryUrl}"><strong>Summary</strong></a> — 2-3 sentence recap</li>`);
    }
    if (args.folderUrl) {
      messageLines.push(`<li><a href="${args.folderUrl}"><strong>All assets</strong></a> — GitHub folder</li>`);
    }
    messageLines.push('</ul>');

    await email.send({
      sender: 'internal',  // resolves to alerts@{brandDomain}
      to: alertsEmail,
      copy: false,  // self-addressed operational alert — no CC/BCC clutter
      subject: `Newsletter ready for manual Beehiiv upload: "${args.subject}"`,
      template: 'card',
      categories: ['marketing/newsletter-manual-upload'],
      data: {
        email: {
          preview: `Beehiiv upload failed — newsletter awaiting manual upload from ${args.folderUrl || 'GitHub archive'}`,
        },
        content: {
          title: 'Newsletter Ready for Manual Upload',
          message: messageLines.join('\n'),
        },
      },
    });

    assistant.log(`Newsletter generator: Beehiiv fallback alert sent to ${alertsEmail}`);
  } catch (e) {
    // Best-effort — log and move on. We don't want a misconfigured email
    // setup to break the cron's Firestore write.
    assistant.error(`Newsletter generator: Beehiiv fallback email failed — ${e.message}`);
  }
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

// fetchSources() removed — replaced by resolveNewsletterSources() from source-resolver.js


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

module.exports = { generate, fetchSources, generatePushId };
