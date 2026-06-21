/**
 * Blog article generation test.
 *
 * Two modes:
 *
 * 1. DEFAULT MODE (no env required)
 *    Verifies the blog auto-publisher config is readable and source resolution
 *    works correctly. No AI calls, no publishing. Fast, free, deterministic.
 *
 * 2. AI PIPELINE MODE (set TEST_EXTENDED_MODE=1)
 *    Runs the full blog auto-publisher pipeline: resolves a source, calls
 *    Ghostii to write an article, and publishes it to the website repo via
 *    admin/post. Same code path the daily cron uses. Costs money (AI tokens).
 *
 * Run from any consumer project's functions/ directory:
 *   npx mgr test mgr:content/blog-generate                   # config check (fast, free)
 *   TEST_EXTENDED_MODE=1  npx mgr test mgr:content/blog-generate  # full AI pipeline
 *
 * --- Env vars (AI mode only, require TEST_EXTENDED_MODE=1) ---
 *   BLOG_SOURCE=<type>        Override the source type for this run.
 *                              Values: '$brand', '$parent', '$feed:<url>', a URL, or text.
 *                              Default: picks randomly from the first content entry's sources[].
 *   BLOG_NO_PUBLISH=1         Generate the article but do NOT publish to the website repo.
 *                              Useful for iterating on prompt quality without committing posts.
 *   BLOG_OPEN=1               Auto-open the generated article in the default browser (macOS only).
 *
 * AI mode requires:
 *   BACKEND_MANAGER_KEY   — authenticates with Ghostii + parent server
 *   OPENAI_API_KEY        — Ghostii uses OpenAI internally (or BACKEND_MANAGER_OPENAI_API_KEY)
 *   PARENT_API_URL        — or set `parent` in backend-manager-config.json (for $parent sources)
 *
 * Default mode requires: nothing.
 */
const path = require('path');
const { execSync } = require('child_process');
const jetpack = require('fs-jetpack');
const powertools = require('node-powertools');

module.exports = {
  description: 'Generate a blog article (config check by default, full AI pipeline with TEST_EXTENDED_MODE)',
  auth: 'none',
  timeout: 300000,
  async run({ assert, config, Manager, assistant, skip }) {
    const env = process.env;
    const blogConfig = Manager.config.blog;

    // --- Default mode: config validation ---
    if (!env.TEST_EXTENDED_MODE) {
      assert.ok(blogConfig, 'blog config exists');
      assert.ok(blogConfig.platform, 'blog.platform is set');
      assert.equal(typeof blogConfig.enabled, 'boolean', 'blog.enabled is a boolean');

      const contentArray = powertools.arrayify(blogConfig.content);
      assert.ok(contentArray.length > 0, 'blog.content has at least one entry');

      const entry = contentArray[0];
      assert.ok(Array.isArray(entry.sources), 'first entry has sources array');
      assert.ok(entry.sources.length > 0, 'first entry has at least one source');

      // Verify source types are valid
      for (const source of entry.sources) {
        const validTypes = source === '$brand'
          || source === '$parent'
          || source.startsWith('$feed:')
          || source.startsWith('http')
          || typeof source === 'string';
        assert.ok(validTypes, `source "${source}" is a valid type`);
      }

      // Verify provider exists
      const providerPath = path.join(__dirname, '..', '..', 'src', 'manager', 'libraries', 'content', `${blogConfig.platform}.js`);
      assert.ok(jetpack.exists(providerPath), `provider "${blogConfig.platform}" exists at ${providerPath}`);

      console.log(`\n[blog-generate] Config OK:`);
      console.log(`  platform: ${blogConfig.platform}`);
      console.log(`  enabled: ${blogConfig.enabled}`);
      console.log(`  entries: ${contentArray.length}`);
      console.log(`  sources: ${entry.sources.join(', ')}`);
      console.log(`  categories: ${(entry.categories || []).join(', ') || '(none)'}`);
      console.log(`  tone: ${entry.tone || '(default)'}`);
      console.log(`  (Set TEST_EXTENDED_MODE=1 to run the full AI pipeline.)`);
      return;
    }

    // --- Extended mode: full AI pipeline ---
    if (!blogConfig?.enabled) {
      return skip('blog.enabled is false in config');
    }

    const publisherPath = path.join(__dirname, '..', '..', 'src', 'manager', 'events', 'cron', 'daily', 'blog-auto-publisher.js');
    const publisher = require(publisherPath);

    // Get content entries
    const contentArray = powertools.arrayify(blogConfig.content);
    assert.ok(contentArray.length > 0, 'blog.content has at least one entry');

    // Clone and override for test
    const content = JSON.parse(JSON.stringify(contentArray));
    content[0].chance = 1.0;
    content[0].quantity = 1;

    // Override source if env specified
    if (env.BLOG_SOURCE) {
      content[0].sources = [env.BLOG_SOURCE];
    }

    Manager.config.blog.content = content;

    // Output dir
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/-(\d{3})Z$/, '');
    const outDir = path.join(process.cwd(), '..', '.temp', 'blog', `run-${stamp}`);
    jetpack.dir(outDir);

    console.log(`\n[blog-generate] Extended mode — full AI pipeline`);
    console.log(`  platform: ${blogConfig.platform}`);
    console.log(`  sources: ${content[0].sources.join(', ')}`);
    console.log(`  publish: ${env.BLOG_NO_PUBLISH ? 'NO (BLOG_NO_PUBLISH=1)' : 'YES'}`);
    console.log(`  output: ${outDir}`);

    // Intercept publishArticle if BLOG_NO_PUBLISH is set
    if (env.BLOG_NO_PUBLISH) {
      const provider = require(path.join(__dirname, '..', '..', 'src', 'manager', 'libraries', 'content', `${blogConfig.platform}.js`));
      const originalPublish = provider.publishArticle;
      provider.publishArticle = async (ast, args) => {
        console.log(`[blog-generate] SKIPPED publishArticle (BLOG_NO_PUBLISH=1)`);
        console.log(`  title: ${args.article?.title || '(unknown)'}`);
        return { post: null, url: null, slug: 'dry-run', path: null };
      };

      // Restore after test
      process.on('exit', () => { provider.publishArticle = originalPublish; });
    }

    // Run the publisher
    await publisher({
      Manager,
      assistant,
      context: {},
      libraries: Manager.libraries,
    });

    // Write metadata
    jetpack.write(path.join(outDir, 'metadata.json'), JSON.stringify({
      mode: 'extended',
      platform: blogConfig.platform,
      sources: content[0].sources,
      published: !env.BLOG_NO_PUBLISH,
      timestamp: new Date().toISOString(),
    }, null, 2));

    console.log(`\n[blog-generate] Done. Output: ${outDir}`);

    // Auto-open (macOS)
    if (env.BLOG_OPEN === '1' && process.platform === 'darwin') {
      try { execSync(`open "${outDir}"`); } catch (e) { /* no-op */ }
    }

    assert.ok(true, 'Blog auto-publisher completed');
  },
};
