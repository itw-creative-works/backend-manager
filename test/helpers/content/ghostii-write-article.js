/**
 * Test: content/ghostii.writeArticle() pass-through
 * Verifies that writeArticle() correctly applies overrides and includes sourceContent.
 *
 * Run: npx mgr test helpers/content/ghostii-write-article
 *
 * These tests intercept the outgoing HTTP request to verify the API body shape
 * without calling the real Ghostii API. The `wonderful-fetch` call is replaced
 * with a spy that captures and returns the request body.
 */
const path = require('path');
const ghostiiPath = path.resolve(__dirname, '../../../src/manager/libraries/content/ghostii.js');

// Capture the request body that writeArticle would send
let capturedBody = null;

function mockFetch(url, opts) {
  capturedBody = opts.body;
  return Promise.resolve(capturedBody);
}

function loadModuleWithMock() {
  // Clear require cache so we get a fresh module
  delete require.cache[ghostiiPath];

  // Temporarily replace wonderful-fetch in the require cache
  const fetchPath = require.resolve('wonderful-fetch');
  const originalFetch = require.cache[fetchPath];
  require.cache[fetchPath] = { id: fetchPath, exports: mockFetch, loaded: true };

  const mod = require(ghostiiPath);

  // Restore original
  if (originalFetch) {
    require.cache[fetchPath] = originalFetch;
  } else {
    delete require.cache[fetchPath];
  }

  return mod;
}

const MOCK_BRAND = {
  brand: { url: 'https://example.com', name: 'TestBrand', id: 'test' },
  github: { user: 'test-user', repo: 'test-repo' },
};

module.exports = {
  description: 'content/ghostii.writeArticle() pass-through',
  type: 'group',

  tests: [
    {
      name: 'defaults-when-no-overrides',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({ brand: MOCK_BRAND, description: 'Test prompt', links: ['https://link.com'] });

        assert.ok(capturedBody, 'request body captured');
        assert.deepEqual(capturedBody.keywords, [''], 'default keywords');
        assert.equal(capturedBody.length, 'long', 'default length');
        assert.equal(capturedBody.research, true, 'default research');
        assert.equal(capturedBody.insertImages, true, 'default insertImages');
        assert.equal(capturedBody.headerImageUrl, 'unsplash', 'default headerImageUrl');
        assert.equal(capturedBody.maxLinks, 6, 'default maxLinks');
        assert.ok(capturedBody.sectionQuantity >= 3 && capturedBody.sectionQuantity <= 6, 'default sectionQuantity in range');
        assert.equal(capturedBody.description, 'Test prompt', 'description passed through');
        assert.deepEqual(capturedBody.links, ['https://link.com'], 'links passed through');
        assert.equal(capturedBody.sourceContent, undefined, 'no sourceContent by default');
      },
    },

    {
      name: 'override-keywords',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
          overrides: { keywords: ['AI', 'tech'] },
        });
        assert.deepEqual(capturedBody.keywords, ['AI', 'tech']);
      },
    },

    {
      name: 'override-length',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
          overrides: { length: 'comprehensive' },
        });
        assert.equal(capturedBody.length, 'comprehensive');
      },
    },

    {
      name: 'override-research-false',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
          overrides: { research: false },
        });
        assert.equal(capturedBody.research, false);
      },
    },

    {
      name: 'override-insertImages-false',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
          overrides: { insertImages: false },
        });
        assert.equal(capturedBody.insertImages, false);
      },
    },

    {
      name: 'override-insertLinks-false',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
          overrides: { insertLinks: false },
        });
        assert.equal(capturedBody.insertLinks, false);
      },
    },

    {
      name: 'override-headerImageUrl',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
          overrides: { headerImageUrl: 'generate' },
        });
        assert.equal(capturedBody.headerImageUrl, 'generate');
      },
    },

    {
      name: 'override-maxLinks',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
          overrides: { maxLinks: 12 },
        });
        assert.equal(capturedBody.maxLinks, 12);
      },
    },

    {
      name: 'override-sectionQuantity',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
          overrides: { sectionQuantity: 8 },
        });
        assert.equal(capturedBody.sectionQuantity, 8);
      },
    },

    {
      name: 'override-feedUrl',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
          overrides: { feedUrl: 'https://myblog.com/feed.json' },
        });
        assert.equal(capturedBody.feedUrl, 'https://myblog.com/feed.json');
      },
    },

    {
      name: 'sourceContent-included-when-provided',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
          sourceContent: 'This is the source article text for rewriting.',
        });
        assert.equal(capturedBody.sourceContent, 'This is the source article text for rewriting.');
      },
    },

    {
      name: 'sourceContent-omitted-when-empty',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
          sourceContent: '',
        });
        assert.equal(capturedBody.sourceContent, undefined, 'empty sourceContent not sent');
      },
    },

    {
      name: 'sourceContent-omitted-when-absent',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
        });
        assert.equal(capturedBody.sourceContent, undefined, 'missing sourceContent not sent');
      },
    },

    {
      name: 'partial-overrides-only-replace-specified',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
          overrides: { length: 'short' },
        });
        assert.equal(capturedBody.length, 'short', 'length overridden');
        assert.equal(capturedBody.maxLinks, 6, 'maxLinks keeps default');
        assert.equal(capturedBody.research, true, 'research keeps default');
        assert.equal(capturedBody.headerImageUrl, 'unsplash', 'headerImageUrl keeps default');
      },
    },

    {
      name: 'brand-url-used-in-body',
      async run({ assert }) {
        const { writeArticle } = loadModuleWithMock();
        await writeArticle({
          brand: MOCK_BRAND, description: 'Test', links: [],
        });
        assert.equal(capturedBody.url, 'https://example.com');
        assert.equal(capturedBody.feedUrl, 'https://example.com/feeds/posts.json');
      },
    },
  ],
};
