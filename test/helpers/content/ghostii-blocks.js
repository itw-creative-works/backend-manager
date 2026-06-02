/**
 * Test: content/ghostii.blocksToPost()
 * Unit tests for the Ghostii-JSON → BEM-post transform.
 *
 * Run: npx mgr test helpers/content/ghostii-blocks
 *
 * Ghostii is unopinionated about BEM: its /write/article response is a generic
 * block array ([{ name, content }], name ∈ heading-1..6/image/paragraph/blockquote/list).
 * blocksToPost() is the SSOT that turns those blocks into what admin/post wants —
 * title + header image as SEPARATE fields, body = content only.
 *
 * Pure function (no I/O) → required directly and called with plain inputs. NOT a mock.
 *
 * Contract:
 *   - title          ← first heading-1 block, leading markdown `#` stripped
 *   - headerImageUrl ← first image block's URL (from `![alt](url)`)
 *   - body           ← every remaining block, joined with blank lines, trimmed
 *   - the title block and the header-image block are EXCLUDED from body
 *   - section images (non-first image blocks) STAY in the body
 *   - non-array / empty input → all empty strings
 */
const { blocksToPost } = require('../../../src/manager/libraries/content/ghostii.js');

module.exports = {
  description: 'content/ghostii.blocksToPost()',
  type: 'group',

  tests: [
    {
      name: 'extracts-title-from-heading-1-stripping-marker',
      async run({ assert }) {
        const result = blocksToPost([
          { name: 'heading-1', content: '# My Great Article' },
          { name: 'paragraph', content: 'Body.' },
        ]);
        assert.equal(result.title, 'My Great Article');
      },
    },

    {
      name: 'extracts-header-image-url-from-first-image-block',
      async run({ assert }) {
        const result = blocksToPost([
          { name: 'heading-1', content: '# Title' },
          { name: 'image', content: '![Title](https://images.unsplash.com/photo-abc?w=1080)' },
          { name: 'paragraph', content: 'Body.' },
        ]);
        assert.equal(result.headerImageUrl, 'https://images.unsplash.com/photo-abc?w=1080');
      },
    },

    {
      name: 'body-excludes-title-and-header-image',
      async run({ assert }) {
        const result = blocksToPost([
          { name: 'heading-1', content: '# Title' },
          { name: 'image', content: '![Title](https://img/header.jpg)' },
          { name: 'heading-2', content: '## First Section' },
          { name: 'paragraph', content: 'First paragraph.' },
        ]);
        assert.equal(result.body, '## First Section\n\nFirst paragraph.', 'body is content only');
        assert.notMatch(result.body, /^#\s/m, 'no H1 title in body');
        assert.notMatch(result.body, /^!\[Title\]\(https:\/\/img\/header\.jpg\)/m, 'no header image in body');
      },
    },

    {
      name: 'keeps-section-images-in-body',
      async run({ assert }) {
        const result = blocksToPost([
          { name: 'heading-1', content: '# Title' },
          { name: 'image', content: '![Title](https://img/header.jpg)' },
          { name: 'heading-2', content: '## Section' },
          { name: 'paragraph', content: 'Text.' },
          { name: 'image', content: '![Section](https://img/section.jpg)' },
          { name: 'paragraph', content: 'More text.' },
        ]);
        // Only the FIRST image is the header; later images belong to the body.
        assert.ok(result.body.includes('![Section](https://img/section.jpg)'), 'section image stays in body');
        assert.equal((result.body.match(/!\[/g) || []).length, 1, 'exactly one (section) image in body');
      },
    },

    {
      name: 'preserves-blockquotes-and-lists-in-body',
      async run({ assert }) {
        const result = blocksToPost([
          { name: 'heading-1', content: '# Title' },
          { name: 'heading-2', content: '## Section' },
          { name: 'blockquote', content: '> A pithy quote.' },
          { name: 'list', content: '- one\n- two' },
        ]);
        assert.ok(result.body.includes('> A pithy quote.'), 'blockquote kept');
        assert.ok(result.body.includes('- one\n- two'), 'list kept');
      },
    },

    {
      name: 'handles-missing-heading-1-and-image-gracefully',
      async run({ assert }) {
        const result = blocksToPost([
          { name: 'heading-2', content: '## Only Section' },
          { name: 'paragraph', content: 'Text.' },
        ]);
        assert.equal(result.title, '', 'no title when no heading-1');
        assert.equal(result.headerImageUrl, '', 'no header image when no image block');
        assert.equal(result.body, '## Only Section\n\nText.', 'body is all blocks when nothing excluded');
      },
    },

    {
      name: 'uses-only-the-first-image-as-header',
      async run({ assert }) {
        const result = blocksToPost([
          { name: 'image', content: '![first](https://img/first.jpg)' },
          { name: 'paragraph', content: 'Text.' },
          { name: 'image', content: '![second](https://img/second.jpg)' },
        ]);
        assert.equal(result.headerImageUrl, 'https://img/first.jpg', 'first image is the header');
        assert.ok(result.body.includes('https://img/second.jpg'), 'second image stays in body');
        assert.ok(!result.body.includes('https://img/first.jpg'), 'first image not in body');
      },
    },

    {
      name: 'non-array-or-empty-input-returns-empty-strings',
      async run({ assert }) {
        assert.deepEqual(blocksToPost([]), { title: '', headerImageUrl: '', body: '' }, 'empty array');
        assert.deepEqual(blocksToPost(null), { title: '', headerImageUrl: '', body: '' }, 'null');
        assert.deepEqual(blocksToPost(undefined), { title: '', headerImageUrl: '', body: '' }, 'undefined');
      },
    },
  ],
};
