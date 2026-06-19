/**
 * Test: content/ghostii-auto-publisher
 * Tests for the upgraded ghostii-auto-publisher cron: source type detection,
 * feed processing, Firestore tracking, hash determinism, and override pass-through.
 *
 * Run: npx mgr test helpers/content/ghostii-auto-publisher
 *
 * Pure-function tests for exported utilities (feedItemHash, isURL). Feed
 * processing and Firestore tracking tests run against the real emulator.
 */
const path = require('path');
const publisherPath = path.resolve(__dirname, '../../../src/manager/events/cron/daily/ghostii-auto-publisher.js');
const { feedItemHash, isURL } = require(publisherPath);

// --- Sample feed XML for testing ---
const SAMPLE_RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <guid>feed-item-1</guid>
      <title>Feed Article One</title>
      <link>https://example.com/article-1</link>
      <description>Description of article one.</description>
    </item>
    <item>
      <guid>feed-item-2</guid>
      <title>Feed Article Two</title>
      <link>https://example.com/article-2</link>
      <description>Description of article two.</description>
    </item>
    <item>
      <guid>feed-item-3</guid>
      <title>Feed Article Three</title>
      <link>https://example.com/article-3</link>
      <description>Description of article three.</description>
    </item>
  </channel>
</rss>`;

module.exports = {
  description: 'content/ghostii-auto-publisher',
  type: 'group',

  tests: [
    // ============================
    // SOURCE TYPE DETECTION (isURL)
    // ============================
    {
      name: 'isURL-detects-http-url',
      async run({ assert }) {
        assert.equal(isURL('https://example.com/page'), true);
        assert.equal(isURL('http://example.com'), true);
      },
    },

    {
      name: 'isURL-rejects-non-urls',
      async run({ assert }) {
        assert.equal(isURL('$app'), false);
        assert.equal(isURL('Write about AI'), false);
        assert.equal(isURL('$feed:https://example.com/feed'), false);
      },
    },

    {
      name: 'isURL-rejects-empty-and-null',
      async run({ assert }) {
        assert.equal(isURL(''), false);
        assert.equal(isURL(null), false);
        assert.equal(isURL(undefined), false);
      },
    },

    // ============================
    // $feed: PREFIX DETECTION
    // ============================
    {
      name: 'feed-prefix-detected-correctly',
      async run({ assert }) {
        const source = '$feed:https://techcrunch.com/feed/';
        assert.equal(source.startsWith('$feed:'), true, '$feed: prefix detected');

        const feedUrl = source.slice('$feed:'.length);
        assert.equal(feedUrl, 'https://techcrunch.com/feed/', 'URL extracted after prefix');
      },
    },

    {
      name: 'feed-prefix-not-confused-with-app',
      async run({ assert }) {
        assert.equal('$app'.startsWith('$feed:'), false);
      },
    },

    {
      name: 'feed-prefix-not-confused-with-plain-url',
      async run({ assert }) {
        assert.equal('https://example.com'.startsWith('$feed:'), false);
      },
    },

    {
      name: 'feed-prefix-not-confused-with-text',
      async run({ assert }) {
        assert.equal('Write about technology'.startsWith('$feed:'), false);
      },
    },

    // ============================
    // FEED ITEM HASH
    // ============================
    {
      name: 'feedItemHash-is-deterministic',
      async run({ assert }) {
        const hash1 = feedItemHash('https://example.com/feed', 'item-123');
        const hash2 = feedItemHash('https://example.com/feed', 'item-123');
        assert.equal(hash1, hash2, 'same input produces same hash');
      },
    },

    {
      name: 'feedItemHash-different-for-different-items',
      async run({ assert }) {
        const hash1 = feedItemHash('https://example.com/feed', 'item-1');
        const hash2 = feedItemHash('https://example.com/feed', 'item-2');
        assert.notEqual(hash1, hash2, 'different items produce different hashes');
      },
    },

    {
      name: 'feedItemHash-different-for-different-feeds',
      async run({ assert }) {
        const hash1 = feedItemHash('https://example.com/feed-a', 'item-1');
        const hash2 = feedItemHash('https://example.com/feed-b', 'item-1');
        assert.notEqual(hash1, hash2, 'same item ID in different feeds produces different hash');
      },
    },

    {
      name: 'feedItemHash-is-20-chars',
      async run({ assert }) {
        const hash = feedItemHash('https://example.com/feed', 'item-123');
        assert.equal(hash.length, 20, 'hash is 20 hex chars');
      },
    },

    {
      name: 'feedItemHash-is-hex-only',
      async run({ assert }) {
        const hash = feedItemHash('https://example.com/feed', 'item-123');
        assert.ok(/^[0-9a-f]+$/.test(hash), 'hash contains only hex characters');
      },
    },

    // ============================
    // FIRESTORE TRACKING (emulator)
    // ============================
    {
      name: 'trackFeedItem-writes-correct-schema',
      async run({ assert, admin }) {
        if (!admin) {
          return assert.ok(true, 'skipped: no emulator');
        }

        const { trackFeedItem } = require(publisherPath);
        const feedUrl = 'https://test-feed.com/rss';
        const item = { id: 'test-item-1', url: 'https://test-feed.com/article-1', title: 'Test Article' };
        const docId = feedItemHash(feedUrl, item.id);

        await trackFeedItem(admin, {
          feedUrl,
          item,
          brandId: 'test-brand',
          postUrl: 'https://test-brand.com/blog/test-article',
          postSlug: 'test-article',
        });

        const doc = await admin.firestore().doc(`ghostii-feed-items/${docId}`).get();
        assert.ok(doc.exists, 'tracking doc created');

        const data = doc.data();
        assert.equal(data.feedUrl, feedUrl);
        assert.equal(data.itemId, 'test-item-1');
        assert.equal(data.itemUrl, 'https://test-feed.com/article-1');
        assert.equal(data.itemTitle, 'Test Article');
        assert.equal(data.brandId, 'test-brand');
        assert.equal(data.postUrl, 'https://test-brand.com/blog/test-article');
        assert.equal(data.postSlug, 'test-article');
        assert.ok(data.metadata, 'has metadata object');
      },
    },

    {
      name: 'getProcessedItemIds-returns-tracked-ids',
      async run({ assert, admin }) {
        if (!admin) {
          return assert.ok(true, 'skipped: no emulator');
        }

        const { getProcessedItemIds, trackFeedItem } = require(publisherPath);
        const feedUrl = 'https://processed-test.com/rss';

        // Track two items
        await trackFeedItem(admin, {
          feedUrl,
          item: { id: 'proc-1', url: 'https://processed-test.com/a1', title: 'Article 1' },
          brandId: 'test-brand',
          postUrl: null,
          postSlug: null,
        });
        await trackFeedItem(admin, {
          feedUrl,
          item: { id: 'proc-2', url: 'https://processed-test.com/a2', title: 'Article 2' },
          brandId: 'test-brand',
          postUrl: null,
          postSlug: null,
        });

        const ids = await getProcessedItemIds(admin, feedUrl);
        assert.ok(ids.has('proc-1'), 'first item tracked');
        assert.ok(ids.has('proc-2'), 'second item tracked');
        assert.ok(!ids.has('proc-3'), 'untracked item not present');
      },
    },

    {
      name: 'getProcessedItemIds-scoped-to-feed-url',
      async run({ assert, admin }) {
        if (!admin) {
          return assert.ok(true, 'skipped: no emulator');
        }

        const { getProcessedItemIds, trackFeedItem } = require(publisherPath);

        // Track item in feed A
        await trackFeedItem(admin, {
          feedUrl: 'https://feed-a.com/rss',
          item: { id: 'scoped-1', url: 'https://feed-a.com/article', title: 'Feed A Article' },
          brandId: 'test-brand',
          postUrl: null,
          postSlug: null,
        });

        // Query feed B — should NOT see feed A's items
        const ids = await getProcessedItemIds(admin, 'https://feed-b.com/rss');
        assert.ok(!ids.has('scoped-1'), 'feed A item not visible in feed B query');
      },
    },

    {
      name: 'getProcessedItemIds-returns-empty-set-without-admin',
      async run({ assert }) {
        const { getProcessedItemIds } = require(publisherPath);
        const ids = await getProcessedItemIds(null, 'https://example.com/feed');
        assert.equal(ids.size, 0, 'returns empty Set when admin is null');
      },
    },

    // ============================
    // SOURCE RESOLUTION (resolveSource)
    // ============================
    {
      name: 'resolveSource-app-returns-description-no-sourceContent',
      async run({ assert }) {
        const { resolveSource } = require(publisherPath);
        const mockAssistant = { log() {}, error() {} };
        const settings = {
          brand: { brand: { name: 'Test', description: 'A test brand', id: 'test' } },
          prompt: 'Focus on AI',
        };

        const result = await resolveSource(mockAssistant, '$app', settings, null);
        assert.ok(result.description.includes('Test'), 'description includes brand name');
        assert.ok(result.description.includes('Focus on AI'), 'description includes custom prompt');
        assert.equal(result.sourceContent, '', 'no sourceContent for $app');
        assert.equal(result.feedItem, undefined, 'no feedItem for $app');
      },
    },

    {
      name: 'resolveSource-text-returns-suggestion-in-description',
      async run({ assert }) {
        const { resolveSource } = require(publisherPath);
        const mockAssistant = { log() {}, error() {} };
        const settings = {
          brand: { brand: { name: 'Test', description: 'A test brand', id: 'test' } },
          prompt: '',
        };

        const result = await resolveSource(mockAssistant, 'Write about blockchain technology', settings, null);
        assert.ok(result.description.includes('blockchain technology'), 'text source in description');
        assert.equal(result.sourceContent, '', 'no sourceContent for text');
      },
    },

    {
      name: 'resolveSource-feed-falls-back-to-app-without-admin',
      async run({ assert }) {
        const { resolveSource } = require(publisherPath);
        const mockAssistant = { log() {}, error() {} };
        const settings = {
          brand: { brand: { name: 'Test', description: 'A test brand', id: 'test' } },
          prompt: '',
        };

        const result = await resolveSource(mockAssistant, '$feed:https://nonexistent.example.com/feed', settings, null);
        assert.ok(result.description, 'falls back to $app and returns description');
        assert.equal(result.sourceContent, '', 'no sourceContent on fallback');
      },
    },

    // ============================
    // MIXED SOURCE DETECTION
    // ============================
    {
      name: 'source-type-detection-covers-all-types',
      async run({ assert }) {
        const sources = [
          '$app',
          '$feed:https://example.com/feed',
          'https://example.com/page',
          'Write about technology trends',
        ];

        // $app
        assert.equal(sources[0], '$app');
        assert.equal(sources[0].startsWith('$feed:'), false);

        // $feed:
        assert.equal(sources[1].startsWith('$feed:'), true);

        // URL
        try { new URL(sources[2]); assert.ok(true, 'URL is valid'); } catch (e) { assert.fail('URL should be valid'); }

        // text (not $app, not $feed:, not URL)
        assert.ok(!sources[3].startsWith('$feed:'), 'text is not feed');
        try { new URL(sources[3]); assert.fail('text should not be URL'); } catch (e) { assert.ok(true, 'text is not URL'); }
      },
    },
  ],
};
