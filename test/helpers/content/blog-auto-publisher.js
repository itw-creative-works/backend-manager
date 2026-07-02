/**
 * Test: content/blog-auto-publisher
 * Tests for the shared source-resolver (used by both blog + newsletter crons):
 * source type detection, Firestore tracking, hash determinism, and the
 * unified pick/fallback resolution.
 *
 * Run: npx mgr test helpers/content/blog-auto-publisher
 *
 * Pure-function tests for exported utilities (contentSourceHash, isURL). Feed
 * processing and Firestore tracking tests run against the real emulator.
 */
const path = require('path');
const resolverPath = path.resolve(__dirname, '../../../src/manager/libraries/content/source-resolver.js');
const { contentSourceHash, isURL } = require(resolverPath);

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
      name: 'isURL-rejects-colon-prefixed-text-and-non-http-schemes',
      async run({ assert }) {
        // "AI:" parses as a URL scheme via new URL() — these are text seeds,
        // not URLs, and must NOT be fetched (the fetch fails and the seed is
        // silently lost)
        assert.equal(isURL('AI: the future of work'), false);
        assert.equal(isURL('Growth: 10 tactics for creators'), false);
        assert.equal(isURL('mailto:someone@example.com'), false);
        assert.equal(isURL('ftp://example.com/file'), false);
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

        const { trackContentSource } = require(resolverPath);
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

        const { trackContentSource } = require(resolverPath);
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

        const { getProcessedItemIds, trackContentSource } = require(resolverPath);
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

        const { getProcessedItemIds, trackContentSource } = require(resolverPath);

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
        const { getProcessedItemIds } = require(resolverPath);
        const ids = await getProcessedItemIds(null, 'https://example.com/feed');
        assert.equal(ids.size, 0, 'returns empty Set when admin is null');
      },
    },

    // ============================
    // UNIFIED SOURCE RESOLUTION (resolveSources / resolvePick)
    // ============================
    {
      name: 'resolveSources-brand-pick-resolves-seed',
      async run({ assert, Manager }) {
        const { resolveSources } = require(resolverPath);
        const assistant = Manager.Assistant();

        const resolved = await resolveSources({
          sources: ['$brand'],
          count: 1,
          assistant,
        });

        assert.equal(resolved.length, 1, 'one source resolved');
        assert.equal(resolved[0].type, 'brand', 'type is brand');
        assert.equal(resolved[0].trackingData, null, 'no trackingData for $brand');
      },
    },

    {
      name: 'resolveSources-text-pick-resolves-content',
      async run({ assert, Manager }) {
        const { resolveSources } = require(resolverPath);
        const assistant = Manager.Assistant();

        const resolved = await resolveSources({
          sources: ['Write about blockchain technology'],
          count: 1,
          assistant,
        });

        assert.equal(resolved.length, 1, 'one source resolved');
        assert.equal(resolved[0].type, 'text', 'type is text');
        assert.equal(resolved[0].content, 'Write about blockchain technology', 'content is the text seed');
        assert.equal(resolved[0].trackingData, null, 'no trackingData for text');
      },
    },

    {
      name: 'resolvePick-feed-failure-never-falls-back-to-brand',
      timeout: 30000,
      async run({ assert, Manager }) {
        const { createResolverState, resolvePick } = require(resolverPath);
        const assistant = Manager.Assistant();

        // $brand IS listed in the pool — the fallback chain must STILL never
        // land on it. Feed fails (nonexistent domain), no $parent listed → null.
        const state = createResolverState({
          sources: ['$feed:https://nonexistent-feed.invalid/feed.xml', '$brand'],
          assistant,
        });

        const result = await resolvePick(state, '$feed:https://nonexistent-feed.invalid/feed.xml');
        assert.equal(result, null, 'feed failure returns null — never falls back to $brand');
      },
    },

    {
      name: 'resolvePick-feed-falls-back-to-other-feeds-then-parent',
      timeout: 30000,
      async run({ assert, Manager }) {
        const { createResolverState, resolvePick } = require(resolverPath);
        const assistant = Manager.Assistant();

        // Both feeds dead, $parent listed but no Manager → parent unreachable → null.
        // Exercises the full chain (same feed → other feeds → parent) without throwing.
        const state = createResolverState({
          sources: [
            '$feed:https://nonexistent-a.invalid/feed.xml',
            '$feed:https://nonexistent-b.invalid/feed.xml',
            '$parent',
          ],
          assistant,
        });

        const result = await resolvePick(state, '$feed:https://nonexistent-a.invalid/feed.xml');
        assert.equal(result, null, 'chain exhausts feeds then parent, returns null');
        assert.ok(state.feedCache.has('https://nonexistent-a.invalid/feed.xml'), 'first feed was tried');
        assert.ok(state.feedCache.has('https://nonexistent-b.invalid/feed.xml'), 'second feed was tried as fallback');
        assert.ok(Array.isArray(state.parentPool), 'parent pool was attempted after feeds');
      },
    },

    {
      name: 'resolvePick-parent-only-falls-back-to-parent',
      async run({ assert, Manager }) {
        const { createResolverState, resolvePick } = require(resolverPath);
        const assistant = Manager.Assistant();

        // Parent unreachable (no Manager). Feeds ARE listed — but $parent must
        // NOT fall back to them.
        const state = createResolverState({
          sources: ['$parent', '$feed:https://nonexistent.invalid/feed.xml', '$brand'],
          assistant,
        });

        const result = await resolvePick(state, '$parent');
        assert.equal(result, null, 'parent failure returns null — never falls to feeds or $brand');
        assert.equal(state.feedCache.size, 0, 'no feed was touched by the parent chain');
      },
    },

    {
      name: 'resolveSources-empty-pool-returns-empty',
      async run({ assert, Manager }) {
        const { resolveSources } = require(resolverPath);
        const assistant = Manager.Assistant();

        const resolved = await resolveSources({ sources: [], count: 3, assistant });
        assert.equal(resolved.length, 0, 'empty pool resolves nothing');
      },
    },

    {
      name: 'resolveSources-dead-feed-only-pool-returns-empty',
      timeout: 30000,
      async run({ assert, Manager }) {
        const { resolveSources } = require(resolverPath);
        const assistant = Manager.Assistant();

        const resolved = await resolveSources({
          sources: ['$feed:https://nonexistent.invalid/feed.xml'],
          count: 2,
          assistant,
        });

        assert.equal(resolved.length, 0, 'dead-feed-only pool resolves nothing (no $brand invented)');
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
