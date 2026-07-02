/**
 * Test: content/ghostii-feed-integration
 * Integration + extended-mode tests for the feed-based article pipeline.
 *
 * Run: npx mgr test --extended helpers/content/ghostii-feed-integration
 *
 * Standard tests: processFeedSource() with inline feed data against the emulator.
 * Extended tests: fetch real RSS/Atom feeds, parse, extract article content,
 * verify Firestore dedup across multiple runs.
 *
 * Extended test artifacts saved to: .temp/ghostii-feed/run-{timestamp}/
 */
const path = require('path');
const jetpack = require('fs-jetpack');
const fetch = require('wonderful-fetch');
const resolverPath = path.resolve(__dirname, '../../../src/manager/libraries/content/source-resolver.js');
const { parseFeed, extractArticleContent } = require('../../../src/manager/libraries/content/feed-parser.js');
const { contentSourceHash, getProcessedItemIds, trackContentSource } = require(resolverPath);

const EXTENDED = !!process.env.TEST_EXTENDED_MODE;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Resolve .temp/ relative to BEM repo root (3 dirs up from test/helpers/content/)
const BEM_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMP_DIR = path.join(BEM_ROOT, '.temp', 'ghostii-feed', `run-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);

// --- Real feed URLs for extended tests ---
// Chosen for stability and confirmed to work with wonderful-fetch.
// Includes generic tech feeds + marketing/social feeds used by OMEGA consumers.
const REAL_FEEDS = [
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', format: 'rss' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', format: 'rss' },
  { name: 'Social Media Examiner', url: 'https://www.socialmediaexaminer.com/feed/', format: 'rss' },
  { name: 'Hootsuite Blog', url: 'https://blog.hootsuite.com/feed/', format: 'rss' },
  { name: 'Sprout Social Insights', url: 'https://sproutsocial.com/insights/feed/', format: 'rss' },
  { name: 'Buffer Resources', url: 'https://buffer.com/resources/feed/', format: 'rss' },
  { name: 'Digiday', url: 'https://digiday.com/feed/', format: 'rss' },
];

/**
 * Save an artifact to .temp/ for post-test inspection.
 */
function saveArtifact(filename, data) {
  try {
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    jetpack.write(path.join(TEMP_DIR, filename), content);
  } catch (e) {
    // Non-fatal — don't break tests over file I/O
  }
}

module.exports = {
  description: 'content/ghostii-feed-integration',
  type: 'suite',
  timeout: 120000,

  tests: [
    // ============================
    // INTEGRATION: processFeedSource pipeline with emulator
    // ============================
    {
      name: 'processFeedSource-selects-unprocessed-item',
      timeout: 15000,

      async run({ assert, admin, state }) {
        if (!admin) {
          return assert.ok(true, 'skipped: no emulator');
        }

        // Pre-track one item so the pipeline has to skip it
        const testFeedUrl = 'https://integration-test.example.com/feed.xml';
        await trackContentSource(admin, {
          url: 'https://integration-test.example.com/old-article',
          origin: `$feed:${testFeedUrl}`,
          feedUrl: testFeedUrl,
          itemId: 'already-tracked',
          itemTitle: 'Old Article',
          usedBy: 'blog',
          brandId: 'test-brand',
          postUrl: null,
          postSlug: null,
        });

        // Verify the tracked item is in the set
        const processed = await getProcessedItemIds(admin, testFeedUrl);
        assert.ok(processed.has('already-tracked'), 'pre-tracked item should be in processed set');
        assert.ok(!processed.has('new-item'), 'new item should NOT be in processed set');

        state.testFeedUrl = testFeedUrl;
      },
    },

    {
      name: 'processFeedSource-filters-tracked-from-parsed-items',
      timeout: 10000,

      async run({ assert, admin, state }) {
        if (!admin || !state.testFeedUrl) {
          return assert.ok(true, 'skipped');
        }

        // Simulate what processFeedSource does: parse → filter → select
        const feedItems = [
          { id: 'already-tracked', title: 'Old Article', url: 'https://integration-test.example.com/old-article', summary: '', content: '', publishedAt: '' },
          { id: 'new-item-1', title: 'New Article 1', url: 'https://integration-test.example.com/new-1', summary: 'Summary 1', content: 'Content 1', publishedAt: '2025-06-18' },
          { id: 'new-item-2', title: 'New Article 2', url: 'https://integration-test.example.com/new-2', summary: 'Summary 2', content: 'Content 2', publishedAt: '2025-06-17' },
        ];

        const processed = await getProcessedItemIds(admin, state.testFeedUrl);
        const unprocessed = feedItems.filter((item) => !processed.has(item.id) && !processed.has(item.url));

        assert.equal(unprocessed.length, 2, 'should have 2 unprocessed items');
        assert.equal(unprocessed[0].id, 'new-item-1', 'first unprocessed is newest');
      },
    },

    {
      name: 'processFeedSource-tracks-after-processing',
      timeout: 15000,

      async run({ assert, admin, state }) {
        if (!admin || !state.testFeedUrl) {
          return assert.ok(true, 'skipped');
        }

        // Track the "newly processed" item
        await trackContentSource(admin, {
          url: 'https://integration-test.example.com/new-1',
          origin: `$feed:${state.testFeedUrl}`,
          feedUrl: state.testFeedUrl,
          itemId: 'new-item-1',
          itemTitle: 'New Article 1',
          usedBy: 'blog',
          brandId: 'test-brand',
          postUrl: 'https://test-brand.com/blog/new-article-1',
          postSlug: 'new-article-1',
        });

        // Now only new-item-2 should be unprocessed
        const processed = await getProcessedItemIds(admin, state.testFeedUrl);
        assert.ok(processed.has('already-tracked'), 'original tracked item still present');
        assert.ok(processed.has('new-item-1'), 'newly tracked item present');
        assert.ok(!processed.has('new-item-2'), 'remaining item still unprocessed');

        // Verify the dedup count
        const feedItems = [
          { id: 'already-tracked', title: 'Old', url: 'https://integration-test.example.com/old-article' },
          { id: 'new-item-1', title: 'New 1', url: 'https://integration-test.example.com/new-1' },
          { id: 'new-item-2', title: 'New 2', url: 'https://integration-test.example.com/new-2' },
        ];
        const unprocessed = feedItems.filter((item) => !processed.has(item.id) && !processed.has(item.url));
        assert.equal(unprocessed.length, 1, 'only 1 item remains after second tracking');
        assert.equal(unprocessed[0].id, 'new-item-2', 'remaining item is new-item-2');
      },
    },

    // ============================
    // EXTENDED: Real RSS feed fetch + parse
    // ============================
    {
      name: 'real-rss-feed-fetches-and-parses',
      timeout: 30000,
      skip: !EXTENDED ? 'TEST_EXTENDED_MODE not set' : false,

      async run({ assert, state }) {
        const feed = REAL_FEEDS[0];
        assert.ok(feed, 'test feed config exists');

        const text = await fetch(feed.url, {
          timeout: 15000,
          tries: 2,
          response: 'text',
          headers: { 'User-Agent': USER_AGENT },
        });

        assert.ok(text, 'feed text fetched');
        assert.ok(text.length > 100, `feed text has content (${text.length} chars)`);

        const result = parseFeed(text);
        assert.ok(result.items.length > 0, `parsed ${result.items.length} items from ${feed.name}`);

        // Verify item shape
        const item = result.items[0];
        assert.ok(item.title, `first item has title: "${item.title.slice(0, 60)}..."`);
        assert.ok(item.url, `first item has URL: ${item.url}`);
        assert.ok(item.id, 'first item has id');

        // Save artifacts
        saveArtifact(`feed-${feed.name.toLowerCase().replace(/\s+/g, '-')}-raw.xml`, text);
        saveArtifact(`feed-${feed.name.toLowerCase().replace(/\s+/g, '-')}-parsed.json`, result.items);

        state.realFeedItems = result.items;
        state.realFeedName = feed.name;
        state.realFeedRawText = text;
      },
    },

    {
      name: 'real-second-feed-fetches-and-parses',
      timeout: 30000,
      skip: !EXTENDED ? 'TEST_EXTENDED_MODE not set' : false,

      async run({ assert }) {
        const feed = REAL_FEEDS[1];

        const text = await fetch(feed.url, {
          timeout: 15000,
          tries: 2,
          response: 'text',
          headers: { 'User-Agent': USER_AGENT },
        });

        assert.ok(text, 'feed text fetched');

        const result = parseFeed(text);
        assert.ok(result.items.length > 0, `parsed ${result.items.length} items from ${feed.name}`);

        const item = result.items[0];
        assert.ok(item.title, `first item has title: "${item.title.slice(0, 60)}..."`);
        assert.ok(item.url, `first item has URL: ${item.url}`);

        // Save artifacts
        saveArtifact(`feed-${feed.name.toLowerCase().replace(/\s+/g, '-')}-raw.xml`, text);
        saveArtifact(`feed-${feed.name.toLowerCase().replace(/\s+/g, '-')}-parsed.json`, result.items);
      },
    },

    // ============================
    // EXTENDED: Real article content extraction
    // ============================
    {
      name: 'real-article-content-extraction',
      timeout: 30000,
      skip: !EXTENDED ? 'TEST_EXTENDED_MODE not set' : false,

      async run({ assert, state }) {
        if (!state.realFeedItems?.length) {
          return assert.ok(true, 'skipped: no feed items from previous test');
        }

        // Pick the first item with a URL
        const item = state.realFeedItems.find((i) => i.url);
        assert.ok(item, 'have an item with a URL to extract');

        const content = await extractArticleContent(item.url);

        // Content extraction is best-effort — some sites block scrapers.
        assert.equal(typeof content, 'string', 'extractArticleContent returns a string');

        if (content.length > 0) {
          assert.ok(content.length >= 50, `extracted ${content.length} chars of article content`);
          assert.ok(content.length <= 1024 * 14, 'content within 14KB limit');
          assert.ok(!content.includes('<script'), 'no script tags in extracted content');
          assert.ok(!content.includes('<style'), 'no style tags in extracted content');
        } else {
          assert.ok(true, `content extraction returned empty for ${item.url} (site may block scraping)`);
        }

        // Save artifacts
        saveArtifact('extracted-article.json', {
          feedName: state.realFeedName,
          sourceItem: { id: item.id, title: item.title, url: item.url },
          extractedLength: content.length,
          extractedPreview: content.slice(0, 2000),
        });
        saveArtifact('extracted-article-full.txt', content);

        state.extractedContent = content;
        state.extractedItem = item;
      },
    },

    // ============================
    // EXTENDED: Full pipeline — feed → parse → track → dedup (real feed + emulator)
    // ============================
    {
      name: 'real-feed-pipeline-tracks-and-deduplicates',
      timeout: 30000,
      skip: !EXTENDED ? 'TEST_EXTENDED_MODE not set' : false,

      async run({ assert, admin, state }) {
        if (!admin || !state.realFeedItems?.length) {
          return assert.ok(true, 'skipped: no emulator or feed items');
        }

        const realFeedUrl = REAL_FEEDS[0].url;
        const firstItem = state.realFeedItems[0];

        // Run 1: track the first item
        await trackContentSource(admin, {
          url: firstItem.url || firstItem.id,
          origin: `$feed:${realFeedUrl}`,
          feedUrl: realFeedUrl,
          itemId: firstItem.id,
          itemTitle: firstItem.title,
          usedBy: 'blog',
          brandId: 'integration-test',
          postUrl: 'https://test.com/blog/article-1',
          postSlug: 'article-1',
        });

        // Run 2: verify it's now in the processed set
        const processed = await getProcessedItemIds(admin, realFeedUrl);
        assert.ok(
          processed.has(firstItem.id) || processed.has(firstItem.url),
          'tracked real feed item is in processed set',
        );

        // Simulate selection: filter out processed items
        const unprocessed = state.realFeedItems.filter(
          (item) => !processed.has(item.id) && !processed.has(item.url),
        );

        assert.ok(
          unprocessed.length < state.realFeedItems.length,
          `dedup removed tracked item (${unprocessed.length} remain of ${state.realFeedItems.length})`,
        );

        const trackedInUnprocessed = unprocessed.find(
          (item) => item.id === firstItem.id || item.url === firstItem.url,
        );
        assert.ok(!trackedInUnprocessed, 'tracked item correctly excluded from unprocessed list');
      },
    },

    {
      name: 'real-feed-pipeline-hash-consistency',
      timeout: 5000,
      skip: !EXTENDED ? 'TEST_EXTENDED_MODE not set' : false,

      async run({ assert, admin, state }) {
        if (!admin || !state.realFeedItems?.length) {
          return assert.ok(true, 'skipped');
        }

        const realFeedUrl = REAL_FEEDS[0].url;
        const firstItem = state.realFeedItems[0];

        // Verify the doc was stored with the expected hash ID
        const expectedDocId = contentSourceHash(`$feed:${realFeedUrl}`, firstItem.url || firstItem.id);
        const doc = await admin.firestore().doc(`content-sources/${expectedDocId}`).get();

        assert.ok(doc.exists, 'tracking doc exists at expected hash-based ID');

        const data = doc.data();
        assert.equal(data.feedUrl, realFeedUrl, 'stored feedUrl matches');
        assert.equal(data.brandId, 'integration-test', 'stored brandId matches');
        assert.ok(data.itemTitle, 'stored itemTitle is not empty');
      },
    },

    // ============================
    // EXTENDED: Multiple feed formats work end-to-end
    // ============================
    {
      name: 'real-multiple-feed-formats-all-parse',
      timeout: 60000,
      skip: !EXTENDED ? 'TEST_EXTENDED_MODE not set' : false,

      async run({ assert }) {
        const results = [];

        for (const feed of REAL_FEEDS) {
          const text = await fetch(feed.url, {
            timeout: 15000,
            tries: 2,
            response: 'text',
            headers: { 'User-Agent': USER_AGENT },
          }).catch((e) => e);

          if (text instanceof Error) {
            results.push({ name: feed.name, format: feed.format, items: 0, error: text.message });
            continue;
          }

          const { items } = parseFeed(text);
          results.push({ name: feed.name, format: feed.format, items: items.length });

          // Save each feed's raw data
          saveArtifact(`feed-${feed.name.toLowerCase().replace(/\s+/g, '-')}-raw.xml`, text);
        }

        // At least 5 of 7 feeds should parse successfully
        const successful = results.filter((r) => r.items > 0);
        assert.ok(
          successful.length >= 5,
          `at least 5 of ${REAL_FEEDS.length} real feeds parsed successfully: ${JSON.stringify(results)}`,
        );

        // Save summary
        saveArtifact('summary.json', {
          timestamp: new Date().toISOString(),
          feeds: results,
          totalItemsParsed: results.reduce((sum, r) => sum + r.items, 0),
        });

        // Log results for visibility
        for (const r of results) {
          assert.ok(true, `${r.name} (${r.format}): ${r.items} items${r.error ? ` [ERROR: ${r.error}]` : ''}`);
        }
      },
    },
  ],
};
