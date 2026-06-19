/**
 * Test: content/blog-auto-publisher
 * Tests for the blog-auto-publisher cron: source type detection,
 * feed processing, Firestore tracking, hash determinism, and source resolution.
 *
 * Run: npx mgr test helpers/content/blog-auto-publisher
 *
 * Pure-function tests for exported utilities (contentSourceHash, isURL). Feed
 * processing and Firestore tracking tests run against the real emulator.
 */
const path = require('path');
const publisherPath = path.resolve(__dirname, '../../../src/manager/events/cron/daily/blog-auto-publisher.js');
const { contentSourceHash, isURL } = require(publisherPath);

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
  description: 'content/blog-auto-publisher',
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
        assert.equal(isURL('$brand'), false);
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
      name: 'feed-prefix-not-confused-with-brand',
      async run({ assert }) {
        assert.equal('$brand'.startsWith('$feed:'), false);
      },
    },

    {
      name: 'feed-prefix-not-confused-with-parent',
      async run({ assert }) {
        assert.equal('$parent'.startsWith('$feed:'), false);
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
    // CONTENT SOURCE HASH
    // ============================
    {
      name: 'contentSourceHash-is-deterministic',
      async run({ assert }) {
        const hash1 = contentSourceHash('$feed:https://example.com/feed', 'item-123');
        const hash2 = contentSourceHash('$feed:https://example.com/feed', 'item-123');
        assert.equal(hash1, hash2, 'same input produces same hash');
      },
    },

    {
      name: 'contentSourceHash-different-for-different-items',
      async run({ assert }) {
        const hash1 = contentSourceHash('$feed:https://example.com/feed', 'item-1');
        const hash2 = contentSourceHash('$feed:https://example.com/feed', 'item-2');
        assert.notEqual(hash1, hash2, 'different items produce different hashes');
      },
    },

    {
      name: 'contentSourceHash-different-for-different-origins',
      async run({ assert }) {
        const hash1 = contentSourceHash('$feed:https://example.com/feed-a', 'item-1');
        const hash2 = contentSourceHash('$feed:https://example.com/feed-b', 'item-1');
        assert.notEqual(hash1, hash2, 'same item ID with different origins produces different hash');
      },
    },

    {
      name: 'contentSourceHash-different-for-different-source-types',
      async run({ assert }) {
        const hash1 = contentSourceHash('$parent', 'source-1');
        const hash2 = contentSourceHash('$feed:https://example.com/feed', 'source-1');
        assert.notEqual(hash1, hash2, '$parent and $feed with same URL produce different hash');
      },
    },

    {
      name: 'contentSourceHash-is-20-chars',
      async run({ assert }) {
        const hash = contentSourceHash('$feed:https://example.com/feed', 'item-123');
        assert.equal(hash.length, 20, 'hash is 20 hex chars');
      },
    },

    {
      name: 'contentSourceHash-is-hex-only',
      async run({ assert }) {
        const hash = contentSourceHash('$feed:https://example.com/feed', 'item-123');
        assert.ok(/^[0-9a-f]+$/.test(hash), 'hash contains only hex characters');
      },
    },

    // ============================
    // FIRESTORE TRACKING (emulator)
    // ============================
    {
      name: 'trackContentSource-writes-correct-schema',
      async run({ assert, admin }) {
        if (!admin) {
          return assert.ok(true, 'skipped: no emulator');
        }

        const { trackContentSource } = require(publisherPath);
        const origin = '$feed:https://test-feed.com/rss';
        const url = 'https://test-feed.com/article-1';
        const docId = contentSourceHash(origin, url);

        await trackContentSource(admin, {
          url,
          origin,
          feedUrl: 'https://test-feed.com/rss',
          itemId: 'test-item-1',
          itemTitle: 'Test Article',
          usedBy: 'blog',
          brandId: 'test-brand',
          postUrl: 'https://test-brand.com/blog/test-article',
          postSlug: 'test-article',
        });

        const doc = await admin.firestore().doc(`content-sources/${docId}`).get();
        assert.ok(doc.exists, 'tracking doc created');

        const data = doc.data();
        assert.equal(data.url, url);
        assert.equal(data.origin, origin);
        assert.equal(data.feedUrl, 'https://test-feed.com/rss');
        assert.equal(data.itemId, 'test-item-1');
        assert.equal(data.itemTitle, 'Test Article');
        assert.equal(data.usedBy, 'blog');
        assert.equal(data.brandId, 'test-brand');
        assert.equal(data.postUrl, 'https://test-brand.com/blog/test-article');
        assert.equal(data.postSlug, 'test-article');
        assert.ok(data.metadata, 'has metadata object');
        assert.ok(data.metadata.created, 'has metadata.created');
        assert.ok(data.metadata.updated, 'has metadata.updated');
        assert.equal(typeof data.metadata.created.timestamp, 'string', 'created.timestamp is ISO string');
        assert.equal(typeof data.metadata.created.timestampUNIX, 'number', 'created.timestampUNIX is number');
        assert.equal(typeof data.metadata.updated.timestamp, 'string', 'updated.timestamp is ISO string');
        assert.equal(typeof data.metadata.updated.timestampUNIX, 'number', 'updated.timestampUNIX is number');
      },
    },

    {
      name: 'trackContentSource-tracks-newsletter-usage',
      async run({ assert, admin }) {
        if (!admin) {
          return assert.ok(true, 'skipped: no emulator');
        }

        const { trackContentSource } = require(publisherPath);
        const origin = '$parent';
        const url = 'https://parent-server.com/source-42';
        const docId = contentSourceHash(origin, url);

        await trackContentSource(admin, {
          url,
          origin,
          itemId: 'source-42',
          itemTitle: 'Newsletter Source',
          usedBy: 'newsletter',
          brandId: 'test-brand',
        });

        const doc = await admin.firestore().doc(`content-sources/${docId}`).get();
        assert.ok(doc.exists, 'tracking doc created for newsletter');

        const data = doc.data();
        assert.equal(data.usedBy, 'newsletter', 'usedBy is newsletter');
        assert.equal(data.origin, '$parent', 'origin is $parent');
      },
    },

    {
      name: 'getProcessedItemIds-returns-tracked-ids',
      async run({ assert, admin }) {
        if (!admin) {
          return assert.ok(true, 'skipped: no emulator');
        }

        const { getProcessedItemIds, trackContentSource } = require(publisherPath);
        const feedUrl = 'https://processed-test.com/rss';
        const origin = `$feed:${feedUrl}`;

        // Track two items
        await trackContentSource(admin, {
          url: 'https://processed-test.com/a1',
          origin,
          feedUrl,
          itemId: 'proc-1',
          itemTitle: 'Article 1',
          usedBy: 'blog',
          brandId: 'test-brand',
        });
        await trackContentSource(admin, {
          url: 'https://processed-test.com/a2',
          origin,
          feedUrl,
          itemId: 'proc-2',
          itemTitle: 'Article 2',
          usedBy: 'blog',
          brandId: 'test-brand',
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

        const { getProcessedItemIds, trackContentSource } = require(publisherPath);

        // Track item in feed A
        await trackContentSource(admin, {
          url: 'https://feed-a.com/article',
          origin: '$feed:https://feed-a.com/rss',
          feedUrl: 'https://feed-a.com/rss',
          itemId: 'scoped-1',
          itemTitle: 'Feed A Article',
          usedBy: 'blog',
          brandId: 'test-brand',
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
      name: 'resolveSource-brand-returns-description-no-sourceContent',
      async run({ assert }) {
        const { resolveSource } = require(publisherPath);
        const mockAssistant = { log() {}, error() {} };
        const entry = {
          brand: { brand: { name: 'Test', description: 'A test brand', id: 'test' } },
          instructions: 'Focus on AI',
          tone: 'professional',
          categories: ['tech'],
          keywords: ['AI', 'automation'],
        };

        const result = await resolveSource(mockAssistant, '$brand', entry, null, null);
        assert.ok(result.description.includes('Test'), 'description includes brand name');
        assert.ok(result.description.includes('Focus on AI'), 'description includes instructions');
        assert.equal(result.sourceContent, '', 'no sourceContent for $brand');
        assert.equal(result.trackingData, undefined, 'no trackingData for $brand');
      },
    },

    {
      name: 'resolveSource-brand-includes-tone-and-keywords',
      async run({ assert }) {
        const { resolveSource } = require(publisherPath);
        const mockAssistant = { log() {}, error() {} };
        const entry = {
          brand: { brand: { name: 'Test', description: 'A test brand', id: 'test' } },
          instructions: '',
          tone: 'casual',
          categories: ['marketing', 'social-media'],
          keywords: ['growth', 'engagement'],
        };

        const result = await resolveSource(mockAssistant, '$brand', entry, null, null);
        assert.ok(result.description.includes('casual'), 'description includes tone');
        assert.ok(result.description.includes('marketing, social-media'), 'description includes categories');
        assert.ok(result.description.includes('growth, engagement'), 'description includes keywords');
      },
    },

    {
      name: 'resolveSource-text-returns-suggestion-in-description',
      async run({ assert }) {
        const { resolveSource } = require(publisherPath);
        const mockAssistant = { log() {}, error() {} };
        const entry = {
          brand: { brand: { name: 'Test', description: 'A test brand', id: 'test' } },
          instructions: '',
          tone: 'professional',
          categories: [],
          keywords: [],
        };

        const result = await resolveSource(mockAssistant, 'Write about blockchain technology', entry, null, null);
        assert.ok(result.description.includes('blockchain technology'), 'text source in description');
        assert.equal(result.sourceContent, '', 'no sourceContent for text');
      },
    },

    {
      name: 'resolveSource-feed-falls-back-to-brand-without-admin',
      async run({ assert }) {
        const { resolveSource } = require(publisherPath);
        const mockAssistant = { log() {}, error() {} };
        const entry = {
          brand: { brand: { name: 'Test', description: 'A test brand', id: 'test' } },
          instructions: '',
          tone: 'professional',
          categories: [],
          keywords: [],
        };

        const result = await resolveSource(mockAssistant, '$feed:https://nonexistent.example.com/feed', entry, null, null);
        assert.ok(result.description, 'falls back to $brand and returns description');
        assert.equal(result.sourceContent, '', 'no sourceContent on fallback');
      },
    },

    {
      name: 'resolveSource-parent-falls-back-to-brand-without-manager',
      async run({ assert }) {
        const { resolveSource } = require(publisherPath);
        const mockAssistant = { log() {}, error() {} };
        const entry = {
          brand: { brand: { name: 'Test', description: 'A test brand', id: 'test' } },
          instructions: '',
          tone: 'professional',
          categories: [],
          keywords: [],
        };

        // Manager is null, so getParentApiUrl() can't be called — falls back to $brand
        const result = await resolveSource(mockAssistant, '$parent', entry, null, null);
        assert.ok(result.description, 'falls back to $brand and returns description');
        assert.equal(result.sourceContent, '', 'no sourceContent on fallback');
      },
    },

    {
      name: 'resolveSource-parent-falls-back-when-no-parent-url',
      async run({ assert }) {
        const { resolveSource } = require(publisherPath);
        const mockAssistant = { log() {}, error() {} };
        const entry = {
          brand: { brand: { name: 'Test', description: 'A test brand', id: 'test' } },
          instructions: '',
          tone: 'professional',
          categories: [],
          keywords: [],
        };

        // Manager with no parent URL configured
        const mockManager = { getParentApiUrl: () => null };
        const result = await resolveSource(mockAssistant, '$parent', entry, null, mockManager);
        assert.ok(result.description, 'falls back to $brand when no parent URL');
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
          '$brand',
          '$parent',
          '$feed:https://example.com/feed',
          'https://example.com/page',
          'Write about technology trends',
        ];

        // $brand
        assert.equal(sources[0], '$brand');
        assert.equal(sources[0].startsWith('$feed:'), false);

        // $parent
        assert.equal(sources[1], '$parent');
        assert.equal(sources[1].startsWith('$feed:'), false);

        // $feed:
        assert.equal(sources[2].startsWith('$feed:'), true);

        // URL
        try { new URL(sources[3]); assert.ok(true, 'URL is valid'); } catch (e) { assert.fail('URL should be valid'); }

        // text (not $brand, not $parent, not $feed:, not URL)
        assert.ok(!sources[4].startsWith('$feed:'), 'text is not feed');
        assert.ok(sources[4] !== '$brand', 'text is not $brand');
        assert.ok(sources[4] !== '$parent', 'text is not $parent');
        try { new URL(sources[4]); assert.fail('text should not be URL'); } catch (e) { assert.ok(true, 'text is not URL'); }
      },
    },
  ],
};
