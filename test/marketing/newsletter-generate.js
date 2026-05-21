/**
 * Newsletter generation iteration test.
 *
 * Two modes:
 *
 * 1. FIXTURE MODE (default — runs in every test invocation, no env required)
 *    Loads a hand-crafted structure JSON from test/marketing/fixtures/<template>.json
 *    and renders it through the active template. No AI, no source fetching,
 *    no images, ~25-50ms render time, $0 cost. This is what runs in CI and
 *    what you iterate against for layout/CSS changes.
 *
 *    Fixture-name resolution priority:
 *      1. NEWSLETTER_FIXTURE=<name>         (explicit override)
 *      2. NEWSLETTER_TEMPLATE=<name>        (use the fixture for the override template)
 *      3. config.marketing.beehiiv.content.template  (use the active brand's template)
 *      4. 'clean'                            (universal fallback)
 *
 *    Add a new template? Drop a matching JSON in test/marketing/fixtures/<name>.json.
 *    The fixture's content shape MUST match the template's `schema` export.
 *
 * 2. AI PIPELINE MODE (set TEST_EXTENDED_MODE=1)
 *    Pulls real sources from the parent BEM server, runs them through the
 *    structure → SVG → MJML pipeline, and writes a preview HTML. Same code
 *    path the daily pre-generation cron uses. Costs money (AI tokens). Use
 *    this when you want to evaluate prompt quality against real sources.
 *
 * Output (both modes): <projectRoot>/.temp/newsletter/run-<timestamp>/  (one level above functions/)
 *
 * Run from somiibo-backend/functions:
 *   npx mgr test project:marketing/newsletter-generate.js                   # fixture (fast, free)
 *   NEWSLETTER_FIXTURE=editorial   npx mgr test project:marketing/newsletter-generate.js
 *   TEST_EXTENDED_MODE=1           npx mgr test project:marketing/newsletter-generate.js  # AI pipeline
 *
 * --- Env vars (most apply to AI mode only) ---
 *   NEWSLETTER_FIXTURE=<name>          Load and render a specific fixture (fixture mode).
 *   NEWSLETTER_TEMPLATE=<name>         Override the layout template for this run.
 *   NEWSLETTER_THEME_ONLY=1            Reuse the most recent AI run's structure.json + PNGs
 *                                       and re-render. Different from FIXTURE: this loads
 *                                       prior AI output, FIXTURE loads hand-crafted JSON.
 *   NEWSLETTER_REUSE_RUN=<dir>         Pair with THEME_ONLY: reuse a specific run dir.
 *   NEWSLETTER_OPEN=1                  Auto-open the rendered preview in the default browser (macOS only).
 *
 *   --- AI-mode-only env vars (require TEST_EXTENDED_MODE=1) ---
 *   NEWSLETTER_PEEK=1                  Fetch + list ready sources, do not claim, exit.
 *   NEWSLETTER_SOURCE_ID=<id>          Generate from one specific source WITHOUT claiming it.
 *   NEWSLETTER_LIMIT=10                Sources per category for PEEK (default 10).
 *   NEWSLETTER_RELEASE=1               Reset locally-tracked claimed sources back to 'ready'.
 *   NEWSLETTER_NO_IMAGES=1             Skip SVG/PNG generation (fast iteration on copy only).
 *   NEWSLETTER_PROVIDER_STRUCTURE=X    Override structure provider (openai|anthropic).
 *   NEWSLETTER_PROVIDER_SVG=X          Override SVG provider (openai|anthropic).
 *   NEWSLETTER_CAMPAIGN_ID=<id>        Override the auto-generated campaign ID (folder name in newsletter-assets).
 *
 *   In EXTENDED mode, the test ALWAYS uploads PNGs + newsletter.html to GitHub
 *   and creates a Beehiiv draft — same side effects as the production cron.
 *   No opt-out, no per-side-effect flag. EXTENDED = production-equivalent run.
 *
 *   --- THEME_ONLY-mode-only env vars ---
 *   NEWSLETTER_BEEHIIV_UPLOAD=1        After re-rendering, upload as a new Beehiiv draft (rare).
 *
 * AI mode requires:
 *   BACKEND_MANAGER_KEY   — authenticates with parent as admin
 *   OPENAI_API_KEY        — structure provider (or BACKEND_MANAGER_OPENAI_API_KEY)
 *   ANTHROPIC_API_KEY     — SVG provider (or BACKEND_MANAGER_ANTHROPIC_API_KEY)
 *   PARENT_API_URL        — or set `parent` in backend-manager-config.json
 *
 * Fixture mode requires: nothing.
 */
const path = require('path');
const { execSync } = require('child_process');
const fetch = require('wonderful-fetch');
const jetpack = require('fs-jetpack');

module.exports = {
  description: 'Generate a newsletter preview (fixture by default, full AI pipeline with TEST_EXTENDED_MODE)',
  auth: 'none',
  timeout: 180000, // 3 min — AI + parallel SVG calls + rasterization
  // The test ALWAYS runs. By default it renders a hand-crafted fixture for the
  // active template (fast, free, deterministic — catches layout regressions in
  // CI). Set TEST_EXTENDED_MODE=1 to switch to the full AI pipeline that fetches
  // real sources, calls the structure + SVG providers, and writes a preview.
  // Other modes (FIXTURE, THEME_ONLY, RELEASE, PEEK) are also opt-in via env.
  async run({ assert, config, Manager, assistant, skip }) {
    const env = process.env;

    // --- Apply env overrides into newsletterConfig ---
    // Newsletter config now lives under marketing.beehiiv.content.
    const newsletterConfig = JSON.parse(JSON.stringify(config.marketing?.beehiiv?.content || {}));

    if (env.NEWSLETTER_PROVIDER_STRUCTURE) {
      newsletterConfig.provider = { ...(newsletterConfig.provider || {}), structure: env.NEWSLETTER_PROVIDER_STRUCTURE };
    }
    if (env.NEWSLETTER_PROVIDER_SVG) {
      newsletterConfig.provider = { ...(newsletterConfig.provider || {}), svg: env.NEWSLETTER_PROVIDER_SVG };
    }
    if (env.NEWSLETTER_TEMPLATE) {
      newsletterConfig.template = env.NEWSLETTER_TEMPLATE;
    }

    // --- Build the output dir ---
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/-(\d{3})Z$/, '');
    // .temp lives at the CONSUMER PROJECT ROOT (e.g. somiibo-backend/.temp), not
    // inside functions/. Matches the convention used by UJM, BXM, electron-manager,
    // etc. — every project's transient cache directory sits at the repo root.
    const outRoot = path.join(process.cwd(), '..', '.temp', 'newsletter');
    const runDir = path.join(outRoot, `run-${stamp}`);
    const claimedFile = path.join(outRoot, '.claimed.json');

    jetpack.dir(runDir);

    // --- Release mode (early return) ---
    if (env.NEWSLETTER_RELEASE) {
      const released = await releaseAll(claimedFile);
      console.log(`Released ${released} previously claimed source(s) back to ready`);
      return;
    }

    // --- Fixture mode ---
    // Default behavior of this test. Loads a hand-crafted structure JSON from
    // test/marketing/fixtures/{name}.json and renders it directly. No AI, no
    // source fetching, no images. Used as the deterministic "predictable
    // preview" loop AND as the default test-suite render.
    //
    // Fixture-name resolution priority:
    //   1. NEWSLETTER_FIXTURE=<name>           (explicit override)
    //   2. NEWSLETTER_TEMPLATE=<name>          (use the fixture for the override template)
    //   3. newsletterConfig.template           (use the fixture for the active brand's template)
    //   4. 'clean'                              (universal fallback)
    //
    // This means a fresh `npx mgr test` against any consumer project picks the
    // brand's configured template, renders the matching fixture, and produces
    // a deterministic preview HTML — no AI, no money spent.
    //
    // The full AI pipeline only runs when TEST_EXTENDED_MODE=1 is set (below).
    // Explicit NEWSLETTER_FIXTURE wins even in EXTENDED mode (you can ask for
    // a fixture render mid-AI-iteration without re-cycling envs).
    // NEWSLETTER_THEME_ONLY takes precedence below — it's a no-AI mode that
    // reuses prior AI output, distinct from fixture mode.
    if (env.NEWSLETTER_THEME_ONLY) {
      // Fall through to the theme-only block below.
    } else if (!env.TEST_EXTENDED_MODE || env.NEWSLETTER_FIXTURE) {
      const requestedFixture = (env.NEWSLETTER_FIXTURE || env.NEWSLETTER_TEMPLATE || newsletterConfig.template || 'clean')
        .replace(/^fixture:/, '');
      const fixturePath = path.join(__dirname, 'fixtures', `${requestedFixture}.json`);

      assert.ok(jetpack.exists(fixturePath),
        `Fixture not found: ${fixturePath}. Available fixtures: ${jetpack.list(path.join(__dirname, 'fixtures')).filter((f) => f.endsWith('.json')).join(', ')}. Every registered template should ship a matching fixture in test/marketing/fixtures/.`);

      const structure = jetpack.read(fixturePath, 'json');

      assert.ok(structure, `Fixture ${requestedFixture}.json failed to parse as JSON`);

      // Pin the template to the fixture name — fixtures are authored for a
      // specific template's content shape, so this prevents the obvious bug
      // of "render the field-report fixture through the clean template".
      // Explicit NEWSLETTER_TEMPLATE override is still honored above.
      if (!env.NEWSLETTER_TEMPLATE) {
        newsletterConfig.template = requestedFixture;
      }

      const { renderNewsletter } = require('../../src/manager/libraries/email/generators/lib/mjml-template.js');
      const { renderMarkdown } = require('../../src/manager/libraries/email/generators/lib/markdown-renderer.js');

      const renderStart = Date.now();
      const { html, mjml, template: templateName } = await renderNewsletter({
        brand: config.brand,
        newsletterConfig,
        structure,
        imagePaths: [],
        campaign: `fixture-${requestedFixture}`,
      });
      // Force the template metadata onto structure so renderMarkdown picks
      // the right body strategy (fixtures don't carry _meta on their own).
      Object.defineProperty(structure, '_meta', {
        enumerable: false,
        configurable: true,
        value: { template: templateName },
      });
      const markdown = renderMarkdown({
        structure,
        brand: config.brand,
        imagePaths: [],
      });
      const renderMs = Date.now() - renderStart;

      const previewPath = path.join(runDir, 'newsletter.html');
      jetpack.write(previewPath, html);
      jetpack.write(path.join(runDir, 'newsletter.md'), markdown);
      if (structure.summary) {
        jetpack.write(path.join(runDir, 'summary.md'), structure.summary + '\n');
      }
      jetpack.write(path.join(runDir, 'newsletter.mjml'), mjml || '');
      jetpack.write(path.join(runDir, 'structure.json'), JSON.stringify(structure, null, 2));
      jetpack.write(path.join(runDir, 'metadata.json'), JSON.stringify({
        mode: 'fixture',
        fixture: requestedFixture,
        template: templateName,
        renderMs,
        tags: structure.tags || [],
        timestamp: new Date().toISOString(),
      }, null, 2));

      console.log(`\n[fixture=${requestedFixture}] Rendered in ${renderMs}ms using template: ${templateName}`);
      console.log(`[fixture=${requestedFixture}] Preview: ${previewPath}`);
      console.log(`[fixture=${requestedFixture}] Markdown: ${path.join(runDir, 'newsletter.md')}`);
      console.log(`[fixture=${requestedFixture}] (Set TEST_EXTENDED_MODE=1 to switch to the full AI pipeline.)`);

      if (env.NEWSLETTER_OPEN === '1' && process.platform === 'darwin') {
        try { execSync(`open "${previewPath}"`); } catch (e) { /* no-op */ }
      }

      assert.ok(html.includes('<html'), 'Rendered HTML');
      assert.ok(markdown.includes('# '), 'Rendered markdown has a heading');
      return;
    }

    // --- Theme-only mode (early return) ---
    // Reuse a previous run's structure.json + PNGs to re-render MJML/HTML only.
    // Sub-second iteration on layout / theme tokens with no AI cost.
    if (env.NEWSLETTER_THEME_ONLY) {
      const sourceRun = resolveReuseRun({
        outRoot,
        explicit: env.NEWSLETTER_REUSE_RUN,
      });

      assert.ok(sourceRun, 'Found a previous run to reuse (set NEWSLETTER_REUSE_RUN=run-<stamp> if needed)');

      console.log(`[theme-only] reusing structure + images from: ${path.basename(sourceRun)}`);

      const structure = jetpack.read(path.join(sourceRun, 'structure.json'), 'json');

      assert.ok(structure?.sections?.length, 'Previous run has a valid structure.json');

      // Copy section PNGs from previous run into this run's dir so paths resolve
      const imagePaths = [];

      for (let i = 0; i < structure.sections.length; i++) {
        const filename = `section-${i + 1}.png`;
        const srcPath = path.join(sourceRun, filename);

        if (jetpack.exists(srcPath)) {
          jetpack.copy(srcPath, path.join(runDir, filename));
          imagePaths.push(`./${filename}`);
        } else {
          imagePaths.push(null);
        }
      }

      const { renderNewsletter } = require('../../src/manager/libraries/email/generators/lib/mjml-template.js');
      const { renderMarkdown } = require('../../src/manager/libraries/email/generators/lib/markdown-renderer.js');

      const renderStart = Date.now();
      const { html, mjml, template: templateName } = await renderNewsletter({
        brand: config.brand,
        newsletterConfig,
        structure,
        imagePaths,
        campaign: `theme-only-${stamp}`,
      });
      // Force the template metadata onto structure so renderMarkdown picks
      // the right body strategy (reused structures may have lost _meta).
      Object.defineProperty(structure, '_meta', {
        enumerable: false,
        configurable: true,
        value: { template: templateName },
      });
      const markdown = renderMarkdown({
        structure,
        brand: config.brand,
        imagePaths,
      });
      const renderMs = Date.now() - renderStart;

      const previewPath = path.join(runDir, 'newsletter.html');
      jetpack.write(previewPath, html);
      jetpack.write(path.join(runDir, 'newsletter.md'), markdown);
      if (structure.summary) {
        jetpack.write(path.join(runDir, 'summary.md'), structure.summary + '\n');
      }
      jetpack.write(path.join(runDir, 'newsletter.mjml'), mjml || '');
      jetpack.write(path.join(runDir, 'structure.json'), JSON.stringify(structure, null, 2));
      jetpack.write(path.join(runDir, 'metadata.json'), JSON.stringify({
        mode: 'theme-only',
        reusedFrom: path.basename(sourceRun),
        template: templateName,
        renderMs,
        tags: structure.tags || [],
        timestamp: new Date().toISOString(),
      }, null, 2));

      console.log(`\n[theme-only] Rendered in ${renderMs}ms using template: ${templateName}`);
      console.log(`[theme-only] Preview: ${previewPath}`);

      // Optional: upload to Beehiiv as a draft
      if (env.NEWSLETTER_BEEHIIV_UPLOAD) {
        await uploadDraftToBeehiiv({
          html,
          structure,
          config,
          assistant: console,
          runDir,
        });
      }

      if (env.NEWSLETTER_OPEN === '1' && process.platform === 'darwin') {
        try { execSync(`open "${previewPath}"`); } catch (e) { /* no-op */ }
      }

      assert.ok(html.includes('<html'), 'Rendered HTML');
      return;
    }

    // --- AI pipeline path (TEST_EXTENDED_MODE) ---
    // Everything below this point talks to the real parent server and the AI
    // providers. The parent URL is required for any of it.
    // Use Manager.getParentApiUrl() — same helper the production newsletter
    // generator uses. config.parent stores the parent's brand URL WITHOUT the
    // `api.` subdomain (e.g. 'https://itwcreativeworks.com'); the helper
    // inserts `api.` at call time. PARENT_API_URL env override is honored
    // verbatim for one-off testing against a different parent.
    const parentUrl = env.PARENT_API_URL || Manager.getParentApiUrl();
    assert.ok(parentUrl, 'PARENT_API_URL (env) or parent (config) must be set for the AI pipeline. Set TEST_EXTENDED_MODE=1 to run it, or omit TEST_EXTENDED_MODE for the fast fixture preview.');

    // --- Peek mode (early return) ---
    if (env.NEWSLETTER_PEEK) {
      const sources = await peekSources({
        parentUrl,
        categories: newsletterConfig.categories || [],
        limit: parseInt(env.NEWSLETTER_LIMIT, 10) || 10,
        key: env.BACKEND_MANAGER_KEY,
      });

      console.log(`\nPeek mode — ${sources.length} ready source(s):\n`);
      sources.forEach((s, i) => {
        const raw = s.source || {};
        const cats = (s.categories || []).join(', ') || s.category || '(none)';
        console.log(`[${i + 1}] ${s.id}`);
        console.log(`    Categories: ${cats}`);
        console.log(`    From:       ${raw.from || s.from || '(unknown)'}`);
        console.log(`    Subject:    ${raw.subject || s.subject || '(none)'}`);
        console.log(`    Headline:   ${s.ai?.headline || '(none — not yet AI-processed)'}`);
        console.log('');
      });

      assert.ok(true, `Peeked ${sources.length} sources`);
      return;
    }

    // --- Fetch sources (real claim) ---
    const sources = await fetchSourcesForRun({
      parentUrl,
      newsletterConfig,
      brandId: config.brand?.id,
      sourceId: env.NEWSLETTER_SOURCE_ID,
      key: env.BACKEND_MANAGER_KEY,
    });

    // Environmental precondition: the parent server must have ready sources in
    // at least one configured category. Skip cleanly when the pool is empty
    // (transient state — no point hard-failing CI on an external queue).
    if (sources.length === 0) {
      return skip('No ready newsletter sources available on parent server (environmental)');
    }

    // Track claimed IDs for later --release-all
    appendClaimed(claimedFile, sources.map((s) => s.id));

    // Force `beehiiv.enabled: true` and inject the per-run newsletter config
    // overrides onto Manager.config. The iteration test IS the explicit trigger
    // — we're not checking whether beehiiv is configured for prod use, we're
    // driving the generator directly. Mutating Manager.config is fine here
    // because this is a `type: 'standalone'` test (one test per process — no
    // cross-test config leakage).
    Manager.config.marketing = {
      ...(Manager.config.marketing || {}),
      beehiiv: {
        ...(Manager.config.marketing?.beehiiv || {}),
        enabled: true,
        content: newsletterConfig,
      },
    };

    // --- Run the production generator with the local-persist image hook ---
    const generator = require('../../src/manager/libraries/email/generators/newsletter.js');

    // EXTENDED mode is a MIRROR of the production cron — no escape hatches.
    // GH upload always happens (PNGs + newsletter.html), Beehiiv draft upload
    // always happens (governed inside newsletter.js by beehiiv.enabled, which
    // we force true above). If you don't want the side effects, run fixture
    // mode instead.
    //
    // persistImage is a side-effect callback that writes PNG+SVG to runDir for
    // local preview / debug. Its return value is ignored when imageHost: 'github'
    // because the generator uses the uploaded CDN URLs in the rendered HTML.
    const persistImage = async (image, idx) => {
      const filename = `section-${idx + 1}.png`;
      const svgFilename = `section-${idx + 1}.svg`;

      jetpack.write(path.join(runDir, filename), image.png);
      jetpack.write(path.join(runDir, svgFilename), image.svg);

      return `./${filename}`;
    };

    // The campaignId becomes the GitHub folder name. Either pinned via env
    // (for repeatable iteration on the same folder) or auto-generated by
    // newsletter.generate() in Firestore auto-ID shape.
    const campaignId = env.NEWSLETTER_CAMPAIGN_ID || undefined;

    console.log(`[extended] uploading to itw-creative-works/newsletter-assets/${config.brand?.id}/${campaignId || '<auto-id>'}/ + Beehiiv draft`);

    const result = await generator.generate(
      Manager,
      assistant,
      { name: `Somiibo Newsletter — Iteration ${stamp}` },
      {
        sources,
        skipClaim: true, // We manage the claim/release lifecycle ourselves
        skipImages: !!env.NEWSLETTER_NO_IMAGES,
        // Local disk persistence runs unconditionally (for preview/debug)
        persistImage,
        // EXTENDED always uploads to GitHub — mirrors production cron exactly
        imageHost: 'github',
        campaignId,
      }
    );

    assert.ok(result, 'Generator returned a result');
    assert.ok(result.contentHtml, 'Generator returned contentHtml');
    assert.ok(result.contentMarkdown, 'Generator returned contentMarkdown');
    assert.ok(result.structure?.sections?.length >= 2, 'Has at least 2 sections');

    // --- Write outputs ---
    const previewPath = path.join(runDir, 'newsletter.html');
    jetpack.write(previewPath, result.contentHtml);
    jetpack.write(path.join(runDir, 'newsletter.md'), result.contentMarkdown);
    if (result.summary) {
      jetpack.write(path.join(runDir, 'summary.md'), result.summary + '\n');
    }
    jetpack.write(path.join(runDir, 'structure.json'), JSON.stringify(result.structure, null, 2));
    jetpack.write(path.join(runDir, 'newsletter.mjml'), result.mjml || '');
    jetpack.write(path.join(runDir, 'metadata.json'), JSON.stringify({
      ...(result.meta || {}),
      tags: result.tags || [],
      assets: result.assets || null,
    }, null, 2));

    console.log(`\nNewsletter preview written: ${previewPath}`);
    console.log(`Subject:   ${result.subject}`);
    console.log(`Preheader: ${result.preheader}`);
    console.log(`Sections:  ${result.structure.sections.length}`);
    if (result.meta?.totals) {
      const t = result.meta.totals;
      console.log(`\nRun summary:`);
      console.log(`  Total duration: ${(result.meta.totalDurationMs / 1000).toFixed(1)}s`);
      console.log(`  AI calls:       ${t.aiCalls}`);
      console.log(`  Tokens:         ${t.inputTokens} in / ${t.outputTokens} out (${t.totalTokens} total)`);
      console.log(`  Cost:           $${t.totalCostUSD}`);
      console.log(`  Filter:    provider=${result.meta.steps.filter?.provider} model=${result.meta.steps.filter?.model} (${result.meta.steps.filter?.durationMs}ms)`);
      console.log(`  Structure: provider=${result.meta.steps.structure?.provider} model=${result.meta.steps.structure?.model} (${result.meta.steps.structure?.durationMs}ms)`);
      for (const img of result.meta.steps.images || []) {
        console.log(`  Image ${img.section}:  provider=${img.provider} model=${img.model} (${img.durationMs}ms${img.fallback ? ', FALLBACK' : ''})`);
      }
    }

    // Beehiiv draft upload already happened inside generator.generate() —
    // newsletter.js calls beehiiv.createPost(draft) after the GH HTML upload.
    // Look for assets.beehiivPostId in the result (null on free plan; non-null
    // once the Beehiiv account is on Enterprise).
    if (result.assets?.beehiivPostId) {
      console.log(`Beehiiv: draft post created — id=${result.assets.beehiivPostId}`);
    }

    // --- Auto-open in browser (macOS) ---
    if (env.NEWSLETTER_OPEN === '1' && process.platform === 'darwin') {
      try {
        execSync(`open "${previewPath}"`);
      } catch (e) {
        console.warn('Failed to auto-open preview:', e.message);
      }
    }
  },
};

/**
 * Upload the rendered HTML to Beehiiv as a draft post (never sends). Uses the
 * v2 Posts API directly so it works against the test's stub Manager.
 *
 * Writes the Beehiiv response to {runDir}/beehiiv-upload.json for inspection.
 *
 * Required env: BEEHIIV_API_KEY
 * Required config: marketing.beehiiv.publicationId (or we fuzzy-match by brand name)
 */
async function uploadDraftToBeehiiv({ html, structure, config, runDir }) {
  const apiKey = process.env.BEEHIIV_API_KEY;

  if (!apiKey) {
    console.warn('[beehiiv] Skipping upload — BEEHIIV_API_KEY not set');
    return;
  }

  const BASE_URL = 'https://api.beehiiv.com/v2';
  const headers = { 'Authorization': `Bearer ${apiKey}` };

  // Resolve publication ID — config first, then fuzzy-match by brand name
  let publicationId = config?.marketing?.beehiiv?.publicationId;
  const brandName = config?.brand?.name;

  if (!publicationId && brandName) {
    try {
      const pubs = await fetch(`${BASE_URL}/publications?limit=100`, {
        response: 'json',
        headers,
        timeout: 10000,
      });
      const brandLower = brandName.toLowerCase();
      const matched = (pubs.data || []).find((p) =>
        p.name.toLowerCase() === brandLower
        || p.name.toLowerCase().includes(brandLower)
        || brandLower.includes(p.name.toLowerCase())
      );
      publicationId = matched?.id;
    } catch (e) {
      console.error('[beehiiv] Publication lookup failed:', e.message);
    }
  }

  if (!publicationId) {
    console.warn(`[beehiiv] Skipping upload — could not resolve publication ID (brand=${brandName})`);
    return;
  }

  // Build the post — always draft from the test (never sends)
  const body = {
    title: structure.subject || `Newsletter ${new Date().toISOString()}`,
    status: 'draft',
    body_content: html,
    email_settings: {
      subject_line: structure.subject,
      preview_text: structure.preheader || '',
    },
  };

  console.log(`[beehiiv] Uploading draft to publication ${publicationId}...`);

  try {
    const data = await fetch(`${BASE_URL}/publications/${publicationId}/posts`, {
      method: 'post',
      response: 'json',
      headers,
      timeout: 30000,
      body,
    });

    if (data.data?.id) {
      const editUrl = `https://app.beehiiv.com/posts/${data.data.id}`;
      console.log(`[beehiiv] ✓ Draft uploaded: ${data.data.id}`);
      console.log(`[beehiiv]   Edit at: ${editUrl}`);
      jetpack.write(path.join(runDir, 'beehiiv-upload.json'), JSON.stringify({
        publicationId,
        postId: data.data.id,
        editUrl,
        status: 'draft',
        uploadedAt: new Date().toISOString(),
        response: data.data,
      }, null, 2));
    } else {
      console.error('[beehiiv] Upload returned no post ID:', JSON.stringify(data));
    }
  } catch (e) {
    console.error('[beehiiv] Upload failed:', e.message);
  }
}

// --- Helpers ---

/**
 * GET /newsletter/sources without claiming (claimFor omitted).
 */
async function peekSources({ parentUrl, categories, limit, key }) {
  if (!categories.length) {
    const data = await fetch(`${parentUrl}/newsletter-sources`, {
      method: 'get',
      response: 'json',
      timeout: 15000,
      query: { limit, backendManagerKey: key },
    });

    return data.sources || [];
  }

  const all = [];
  for (const category of categories) {
    const data = await fetch(`${parentUrl}/newsletter-sources`, {
      method: 'get',
      response: 'json',
      timeout: 15000,
      query: { category, limit, backendManagerKey: key },
    });

    all.push(...(data.sources || []));
  }

  return all;
}

/**
 * Fetch sources for an actual generation run. Either:
 *   - A specific source by id — preview only, NO claim (iterate repeatedly on the same source)
 *   - Or N per category (claims them atomically for the brand)
 *
 * When NEWSLETTER_SOURCE_ID is set, we look the source up in any status
 * (ready, claimed, used) so you can keep iterating on it across runs without
 * the parent server's claim mechanism marking it consumed.
 */
async function fetchSourcesForRun({ parentUrl, newsletterConfig, brandId, sourceId, key }) {
  if (sourceId) {
    // Peek across ALL ready sources (no claim). Search broadly first, then
    // fall back to any-status if needed. We never call claimFor with sourceId
    // so the source stays available for future runs.
    const all = await peekSources({
      parentUrl,
      categories: newsletterConfig.categories || [],
      limit: 100,
      key,
    });

    const match = all.find((s) => s.id === sourceId);

    if (match) {
      console.log(`[source-id-mode] Found ${sourceId} in ready pool, using WITHOUT claiming (iteration mode)`);
      return [match];
    }

    // Not in ready pool — could be already claimed/used. Try the broad endpoint without category filter.
    const broad = await peekSources({
      parentUrl,
      categories: [],
      limit: 100,
      key,
    });
    const matchBroad = broad.find((s) => s.id === sourceId);

    if (matchBroad) {
      console.log(`[source-id-mode] Found ${sourceId} (outside configured categories), using WITHOUT claiming`);
      return [matchBroad];
    }

    throw new Error(`Source ${sourceId} not found. It may have been used (status: used) or never existed.`);
  }

  // Normal: claim N per category
  const categories = newsletterConfig.categories || [];

  if (!categories.length) {
    throw new Error('marketing.beehiiv.content.categories must have at least one entry');
  }

  const all = [];
  for (const category of categories) {
    const data = await fetch(`${parentUrl}/newsletter-sources`, {
      method: 'get',
      response: 'json',
      timeout: 15000,
      query: { category, limit: 3, claimFor: brandId, backendManagerKey: key },
    });
    all.push(...(data.sources || []));
  }

  return all;
}

/**
 * Find a previous run directory to reuse for theme-only iteration.
 * Either honors NEWSLETTER_REUSE_RUN explicitly, or picks the most recent
 * run-* directory under outRoot. Skips the current in-progress run dir.
 */
function resolveReuseRun({ outRoot, explicit }) {
  if (explicit) {
    const candidate = path.join(outRoot, explicit);
    return jetpack.exists(candidate) ? candidate : null;
  }

  if (!jetpack.exists(outRoot)) {
    return null;
  }

  const entries = jetpack.list(outRoot) || [];
  const runs = entries
    .filter((name) => name.startsWith('run-'))
    .map((name) => ({ name, full: path.join(outRoot, name) }))
    .filter((r) => {
      // Must contain a structure.json to be reusable
      return jetpack.exists(path.join(r.full, 'structure.json')) === 'file';
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1));

  return runs[0]?.full || null;
}

function appendClaimed(claimedFile, ids) {
  const existing = jetpack.exists(claimedFile) ? jetpack.read(claimedFile, 'json') || [] : [];
  const stamped = ids.map((id) => ({ id, claimedAt: Math.round(Date.now() / 1000) }));
  jetpack.write(claimedFile, [...existing, ...stamped]);
}

async function releaseAll(claimedFile) {
  if (!jetpack.exists(claimedFile)) {
    return 0;
  }

  const entries = jetpack.read(claimedFile, 'json') || [];

  if (!entries.length) {
    return 0;
  }

  const saPath = process.env.PARENT_SERVICE_ACCOUNT_PATH;

  if (!saPath) {
    throw new Error('PARENT_SERVICE_ACCOUNT_PATH env var is required for release. Point it at the parent project service-account.json.');
  }

  // Lazy-require firebase-admin
  const admin = require('firebase-admin');

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(require(saPath)),
    });
  }

  const db = admin.firestore();
  let released = 0;

  for (const entry of entries) {
    try {
      await db.collection('newsletter-sources').doc(entry.id).update({
        status: 'ready',
        usedBy: null,
        claimedBy: null,
        usedAt: null,
        claimedAt: null,
      });
      released++;
    } catch (e) {
      console.warn(`Failed to release ${entry.id}: ${e.message}`);
    }
  }

  // Clear the tracker
  jetpack.write(claimedFile, []);

  return released;
}

