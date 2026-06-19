/**
 * Test: content/feed-parser
 * Unit tests for the RSS 2.0, Atom 1.0, and JSON Feed parser + article content extractor.
 *
 * Run: npx mgr test helpers/content/feed-parser
 *
 * Pure function tests (parseFeed, stripHtml, extractElement) — required
 * directly and called with plain inputs. NOT a mock.
 */
const { parseFeed, stripHtml, extractTextFromHtml } = require('../../../src/manager/libraries/content/feed-parser.js');

// --- Sample feeds for testing ---

const RSS_FULL = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Tech News</title>
    <link>https://example.com</link>
    <description>Latest tech news</description>
    <item>
      <guid>https://example.com/article-1</guid>
      <title>First Article Title</title>
      <link>https://example.com/article-1</link>
      <description>Short description of the first article.</description>
      <content:encoded><![CDATA[<p>Full content of the first article with <strong>HTML</strong> formatting.</p>]]></content:encoded>
      <pubDate>Mon, 16 Jun 2025 10:00:00 GMT</pubDate>
      <dc:creator>Jane Doe</dc:creator>
    </item>
    <item>
      <guid isPermaLink="false">article-2-id</guid>
      <title>Second Article Title</title>
      <link>https://example.com/article-2</link>
      <description>Short description of the second article.</description>
      <pubDate>Tue, 17 Jun 2025 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const RSS_MINIMAL = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Minimal</title>
    <item>
      <title>Only Title</title>
      <link>https://example.com/only</link>
    </item>
  </channel>
</rss>`;

const RSS_EMPTY_CHANNEL = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Empty</title>
  </channel>
</rss>`;

const ATOM_FULL = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <id>urn:uuid:entry-1</id>
    <title>Atom Entry One</title>
    <link rel="alternate" href="https://example.com/atom-1"/>
    <link rel="enclosure" href="https://example.com/atom-1.mp3"/>
    <summary>Summary of entry one.</summary>
    <content>Full content of entry one.</content>
    <published>2025-06-16T10:00:00Z</published>
  </entry>
  <entry>
    <id>urn:uuid:entry-2</id>
    <title type="html">Atom Entry &amp; Two</title>
    <link href="https://example.com/atom-2"/>
    <updated>2025-06-17T12:00:00Z</updated>
  </entry>
</feed>`;

const ATOM_EMPTY = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Empty Atom</title>
</feed>`;

const JSON_FEED = JSON.stringify({
  version: 'https://jsonfeed.org/version/1.1',
  title: 'JSON Feed',
  items: [
    {
      id: 'json-1',
      title: 'JSON Article One',
      url: 'https://example.com/json-1',
      summary: 'Short summary.',
      content_html: '<p>Full HTML content.</p>',
      content_text: 'Full text content.',
      date_published: '2025-06-16T10:00:00Z',
    },
    {
      id: 'json-2',
      title: 'JSON Article Two',
      url: 'https://example.com/json-2',
      content_text: 'Second article text.',
      date_modified: '2025-06-17T12:00:00Z',
    },
  ],
});

const RSSAPP_FORMAT = JSON.stringify({
  items: [
    {
      title: 'RSS.app Item',
      url: 'https://example.com/rssapp-1',
      content_text: 'Content from RSS.app feed.',
    },
  ],
});

module.exports = {
  description: 'content/feed-parser',
  type: 'group',

  tests: [
    // ============================
    // RSS 2.0 PARSING
    // ============================
    {
      name: 'rss-parses-standard-items',
      async run({ assert }) {
        const { items } = parseFeed(RSS_FULL);
        assert.equal(items.length, 2, 'should parse 2 items');
        assert.equal(items[0].title, 'First Article Title');
        assert.equal(items[1].title, 'Second Article Title');
      },
    },

    {
      name: 'rss-extracts-guid-as-id',
      async run({ assert }) {
        const { items } = parseFeed(RSS_FULL);
        assert.equal(items[0].id, 'https://example.com/article-1', 'text guid');
        assert.equal(items[1].id, 'article-2-id', 'guid with isPermaLink attr');
      },
    },

    {
      name: 'rss-extracts-link-as-url',
      async run({ assert }) {
        const { items } = parseFeed(RSS_FULL);
        assert.equal(items[0].url, 'https://example.com/article-1');
        assert.equal(items[1].url, 'https://example.com/article-2');
      },
    },

    {
      name: 'rss-extracts-description-as-summary',
      async run({ assert }) {
        const { items } = parseFeed(RSS_FULL);
        assert.equal(items[0].summary, 'Short description of the first article.');
      },
    },

    {
      name: 'rss-extracts-content-encoded-as-content',
      async run({ assert }) {
        const { items } = parseFeed(RSS_FULL);
        assert.ok(items[0].content.includes('Full content of the first article'), 'has content:encoded text');
        assert.ok(!items[0].content.includes('<p>'), 'HTML stripped from content');
      },
    },

    {
      name: 'rss-falls-back-to-description-when-no-content-encoded',
      async run({ assert }) {
        const { items } = parseFeed(RSS_FULL);
        assert.equal(items[1].content, 'Short description of the second article.');
      },
    },

    {
      name: 'rss-extracts-pubdate',
      async run({ assert }) {
        const { items } = parseFeed(RSS_FULL);
        assert.equal(items[0].publishedAt, 'Mon, 16 Jun 2025 10:00:00 GMT');
      },
    },

    {
      name: 'rss-handles-missing-optional-fields',
      async run({ assert }) {
        const { items } = parseFeed(RSS_MINIMAL);
        assert.equal(items.length, 1);
        assert.equal(items[0].title, 'Only Title');
        assert.equal(items[0].url, 'https://example.com/only');
        assert.equal(items[0].summary, '', 'no description');
        assert.equal(items[0].publishedAt, '', 'no pubDate');
      },
    },

    {
      name: 'rss-preserves-item-order',
      async run({ assert }) {
        const { items } = parseFeed(RSS_FULL);
        assert.equal(items[0].title, 'First Article Title', 'first item is first');
        assert.equal(items[1].title, 'Second Article Title', 'second item is second');
      },
    },

    {
      name: 'rss-empty-channel-returns-empty-items',
      async run({ assert }) {
        const { items } = parseFeed(RSS_EMPTY_CHANNEL);
        assert.equal(items.length, 0);
      },
    },

    // ============================
    // ATOM 1.0 PARSING
    // ============================
    {
      name: 'atom-parses-standard-entries',
      async run({ assert }) {
        const { items } = parseFeed(ATOM_FULL);
        assert.equal(items.length, 2, 'should parse 2 entries');
        assert.equal(items[0].title, 'Atom Entry One');
      },
    },

    {
      name: 'atom-extracts-id',
      async run({ assert }) {
        const { items } = parseFeed(ATOM_FULL);
        assert.equal(items[0].id, 'urn:uuid:entry-1');
        assert.equal(items[1].id, 'urn:uuid:entry-2');
      },
    },

    {
      name: 'atom-picks-alternate-link-href',
      async run({ assert }) {
        const { items } = parseFeed(ATOM_FULL);
        assert.equal(items[0].url, 'https://example.com/atom-1', 'picks rel=alternate over enclosure');
      },
    },

    {
      name: 'atom-falls-back-to-first-link-when-no-rel',
      async run({ assert }) {
        const { items } = parseFeed(ATOM_FULL);
        assert.equal(items[1].url, 'https://example.com/atom-2', 'link without rel');
      },
    },

    {
      name: 'atom-extracts-summary-and-content',
      async run({ assert }) {
        const { items } = parseFeed(ATOM_FULL);
        assert.equal(items[0].summary, 'Summary of entry one.');
        assert.equal(items[0].content, 'Full content of entry one.');
      },
    },

    {
      name: 'atom-extracts-published-or-updated',
      async run({ assert }) {
        const { items } = parseFeed(ATOM_FULL);
        assert.equal(items[0].publishedAt, '2025-06-16T10:00:00Z', 'published');
        assert.equal(items[1].publishedAt, '2025-06-17T12:00:00Z', 'updated fallback');
      },
    },

    {
      name: 'atom-empty-feed-returns-empty-items',
      async run({ assert }) {
        const { items } = parseFeed(ATOM_EMPTY);
        assert.equal(items.length, 0);
      },
    },

    // ============================
    // JSON FEED PARSING
    // ============================
    {
      name: 'json-parses-standard-items',
      async run({ assert }) {
        const { items } = parseFeed(JSON_FEED);
        assert.equal(items.length, 2);
        assert.equal(items[0].title, 'JSON Article One');
        assert.equal(items[1].title, 'JSON Article Two');
      },
    },

    {
      name: 'json-extracts-id-and-url',
      async run({ assert }) {
        const { items } = parseFeed(JSON_FEED);
        assert.equal(items[0].id, 'json-1');
        assert.equal(items[0].url, 'https://example.com/json-1');
      },
    },

    {
      name: 'json-prefers-content-html-over-content-text',
      async run({ assert }) {
        const { items } = parseFeed(JSON_FEED);
        assert.equal(items[0].content, '<p>Full HTML content.</p>');
      },
    },

    {
      name: 'json-falls-back-to-content-text',
      async run({ assert }) {
        const { items } = parseFeed(JSON_FEED);
        assert.equal(items[1].content, 'Second article text.');
      },
    },

    {
      name: 'json-extracts-dates',
      async run({ assert }) {
        const { items } = parseFeed(JSON_FEED);
        assert.equal(items[0].publishedAt, '2025-06-16T10:00:00Z', 'date_published');
        assert.equal(items[1].publishedAt, '2025-06-17T12:00:00Z', 'date_modified fallback');
      },
    },

    {
      name: 'json-handles-rssapp-format',
      async run({ assert }) {
        const { items } = parseFeed(RSSAPP_FORMAT);
        assert.equal(items.length, 1);
        assert.equal(items[0].title, 'RSS.app Item');
        assert.equal(items[0].content, 'Content from RSS.app feed.');
      },
    },

    {
      name: 'json-empty-items-returns-empty',
      async run({ assert }) {
        const { items } = parseFeed(JSON.stringify({ items: [] }));
        assert.equal(items.length, 0);
      },
    },

    // ============================
    // EDGE CASES
    // ============================
    {
      name: 'returns-empty-for-null-input',
      async run({ assert }) {
        assert.deepEqual(parseFeed(null), { items: [] });
      },
    },

    {
      name: 'returns-empty-for-undefined-input',
      async run({ assert }) {
        assert.deepEqual(parseFeed(undefined), { items: [] });
      },
    },

    {
      name: 'returns-empty-for-empty-string',
      async run({ assert }) {
        assert.deepEqual(parseFeed(''), { items: [] });
      },
    },

    {
      name: 'returns-empty-for-invalid-xml',
      async run({ assert }) {
        const { items } = parseFeed('<not<valid>xml');
        assert.equal(items.length, 0);
      },
    },

    {
      name: 'returns-empty-for-non-feed-json',
      async run({ assert }) {
        const { items } = parseFeed(JSON.stringify({ data: [1, 2, 3] }));
        assert.equal(items.length, 0);
      },
    },

    {
      name: 'returns-empty-for-plain-text',
      async run({ assert }) {
        const { items } = parseFeed('just some plain text content');
        assert.equal(items.length, 0);
      },
    },

    {
      name: 'handles-bom-prefix',
      async run({ assert }) {
        const withBom = '﻿' + RSS_MINIMAL;
        const { items } = parseFeed(withBom);
        assert.equal(items.length, 1, 'BOM does not break parsing');
        assert.equal(items[0].title, 'Only Title');
      },
    },

    {
      name: 'handles-namespace-prefixed-elements',
      async run({ assert }) {
        const { items } = parseFeed(RSS_FULL);
        assert.ok(items[0].content.includes('Full content'), 'content:encoded parsed despite namespace');
      },
    },

    {
      name: 'truncates-long-content',
      async run({ assert }) {
        const longContent = 'x'.repeat(20000);
        const feed = JSON.stringify({
          items: [{ id: '1', title: 'Long', url: 'https://example.com', content_text: longContent }],
        });
        const { items } = parseFeed(feed);
        assert.ok(items[0].content.length <= 1024 * 14, 'content truncated to 14KB');
      },
    },

    {
      name: 'truncates-long-summary',
      async run({ assert }) {
        const longSummary = 'y'.repeat(1000);
        const feed = JSON.stringify({
          items: [{ id: '1', title: 'Long Summary', url: 'https://example.com', summary: longSummary }],
        });
        const { items } = parseFeed(feed);
        assert.ok(items[0].summary.length <= 500, 'summary truncated to 500 chars');
      },
    },

    // ============================
    // STRIP HTML
    // ============================
    {
      name: 'stripHtml-removes-tags',
      async run({ assert }) {
        assert.equal(stripHtml('<p>Hello <strong>world</strong></p>'), 'Hello world');
      },
    },

    {
      name: 'stripHtml-normalizes-whitespace',
      async run({ assert }) {
        assert.equal(stripHtml('<p>Hello</p>   <p>World</p>'), 'Hello World');
      },
    },

    {
      name: 'stripHtml-handles-empty-string',
      async run({ assert }) {
        assert.equal(stripHtml(''), '');
      },
    },

    // ============================
    // EXTRACT TEXT FROM HTML (Cheerio)
    // ============================
    {
      name: 'extractTextFromHtml-extracts-from-article-tag',
      async run({ assert }) {
        const html = '<html><body><nav>Menu</nav><article class="post"><p>Article content</p></article><footer>Footer</footer></body></html>';
        const text = extractTextFromHtml(html);
        assert.ok(text.includes('Article content'), 'extracts article text');
        assert.ok(!text.includes('Menu'), 'nav removed');
        assert.ok(!text.includes('Footer'), 'footer removed');
      },
    },

    {
      name: 'extractTextFromHtml-falls-back-to-main',
      async run({ assert }) {
        const html = '<html><body><main><p>Main content</p></main><aside>Sidebar</aside></body></html>';
        const text = extractTextFromHtml(html);
        assert.ok(text.includes('Main content'), 'extracts main text');
        assert.ok(!text.includes('Sidebar'), 'aside removed');
      },
    },

    {
      name: 'extractTextFromHtml-falls-back-to-body',
      async run({ assert }) {
        const html = '<html><body><p>Body content here</p></body></html>';
        const text = extractTextFromHtml(html);
        assert.ok(text.includes('Body content here'), 'extracts body text');
      },
    },

    {
      name: 'extractTextFromHtml-strips-scripts-and-styles',
      async run({ assert }) {
        const html = '<html><body><article><script>alert("xss")</script><style>.x{color:red}</style><p>Clean text</p></article></body></html>';
        const text = extractTextFromHtml(html);
        assert.ok(text.includes('Clean text'), 'keeps article text');
        assert.ok(!text.includes('alert'), 'script removed');
        assert.ok(!text.includes('color'), 'style removed');
      },
    },

    {
      name: 'extractTextFromHtml-strips-forms-and-buttons',
      async run({ assert }) {
        const html = '<html><body><article><p>Article text</p><form><input placeholder="Email"><button>Subscribe</button></form></article></body></html>';
        const text = extractTextFromHtml(html);
        assert.ok(text.includes('Article text'), 'keeps article text');
        assert.ok(!text.includes('Subscribe'), 'button removed');
      },
    },

    {
      name: 'extractTextFromHtml-strips-ad-classes',
      async run({ assert }) {
        const html = '<html><body><article><p>Real content</p><div class="advertisement">Buy stuff</div><div class="social-share">Share this</div></article></body></html>';
        const text = extractTextFromHtml(html);
        assert.ok(text.includes('Real content'), 'keeps article text');
        assert.ok(!text.includes('Buy stuff'), 'ad removed');
        assert.ok(!text.includes('Share this'), 'social share removed');
      },
    },

    {
      name: 'extractTextFromHtml-returns-empty-for-empty-html',
      async run({ assert }) {
        assert.equal(extractTextFromHtml(''), '');
        assert.equal(extractTextFromHtml('<html><body></body></html>'), '');
      },
    },
  ],
};
