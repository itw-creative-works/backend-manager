/**
 * Test: helpers/utilities.slugify()
 * Unit tests for the canonical URL slug builder.
 *
 * Run: npx mgr test helpers/slugify
 *
 * slugify is the SSOT used by:
 *   - BEM admin/post (legacy + modern) for URL + image filenames
 *   - Sponsorship platform validator.buildFormatted()
 *
 * Contract:
 *   - Strip all non-alphanumeric characters → replace with `-`
 *   - Collapse runs of `-` into a single `-`
 *   - Trim leading/trailing `-`
 *   - Lowercase the result
 *   - Non-string input → empty string
 */
const Utilities = require('../../src/manager/helpers/utilities.js');

const Manager = { libraries: {} };
const utilities = new Utilities(Manager);

module.exports = {
  description: 'Utilities.slugify()',
  type: 'group',

  tests: [
    // ─── Basic happy path ───

    {
      name: 'lowercases-simple-string',
      async run({ assert }) {
        assert.equal(utilities.slugify('Hello World'), 'hello-world');
      },
    },

    {
      name: 'preserves-numbers',
      async run({ assert }) {
        assert.equal(utilities.slugify('Top 10 Products 2025'), 'top-10-products-2025');
      },
    },

    {
      name: 'already-a-slug-passes-through',
      async run({ assert }) {
        assert.equal(utilities.slugify('already-a-slug'), 'already-a-slug');
      },
    },

    {
      name: 'single-word-unchanged',
      async run({ assert }) {
        assert.equal(utilities.slugify('hello'), 'hello');
      },
    },

    // ─── The bug that drove this: collapse runs of `-` ───

    {
      name: 'collapses-double-dashes-from-literal-hyphen-space',
      async run({ assert }) {
        // The real-world example: "Copy- Paste" produced "copy--paste" before the fix
        assert.equal(
          utilities.slugify('AI Study Prompts That Work: Copy- Paste Questions for Every Subject'),
          'ai-study-prompts-that-work-copy-paste-questions-for-every-subject',
        );
      },
    },

    {
      name: 'collapses-many-consecutive-dashes',
      async run({ assert }) {
        assert.equal(utilities.slugify('foo---bar'), 'foo-bar');
        assert.equal(utilities.slugify('foo-----bar'), 'foo-bar');
      },
    },

    {
      name: 'collapses-mixed-runs-of-special-chars',
      async run({ assert }) {
        // " / - / " → multiple non-alphanum → all become one `-`
        assert.equal(utilities.slugify('foo / - / bar'), 'foo-bar');
      },
    },

    // ─── Leading/trailing trim ───

    {
      name: 'strips-leading-and-trailing-spaces',
      async run({ assert }) {
        assert.equal(utilities.slugify('  hello world  '), 'hello-world');
      },
    },

    {
      name: 'strips-leading-and-trailing-dashes',
      async run({ assert }) {
        assert.equal(utilities.slugify('---hello---'), 'hello');
      },
    },

    {
      name: 'strips-leading-slash',
      async run({ assert }) {
        assert.equal(utilities.slugify('/foo/bar'), 'foo-bar');
      },
    },

    {
      name: 'strips-trailing-slash',
      async run({ assert }) {
        assert.equal(utilities.slugify('foo/bar/'), 'foo-bar');
      },
    },

    {
      name: 'strips-both-slashes',
      async run({ assert }) {
        assert.equal(utilities.slugify('/foo/bar/'), 'foo-bar');
      },
    },

    // ─── Punctuation ───

    {
      name: 'colon-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify('Title: Subtitle'), 'title-subtitle');
      },
    },

    {
      name: 'comma-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify('one, two, three'), 'one-two-three');
      },
    },

    {
      name: 'question-mark-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify('What is AI?'), 'what-is-ai');
      },
    },

    {
      name: 'exclamation-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify('Hello World!'), 'hello-world');
      },
    },

    {
      name: 'period-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify('v1.2.3'), 'v1-2-3');
      },
    },

    {
      name: 'apostrophe-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify("don't stop"), 'don-t-stop');
      },
    },

    {
      name: 'quotes-become-dashes',
      async run({ assert }) {
        assert.equal(utilities.slugify('"Hello" said the dog'), 'hello-said-the-dog');
      },
    },

    {
      name: 'parens-become-dashes',
      async run({ assert }) {
        assert.equal(utilities.slugify('Function (advanced)'), 'function-advanced');
      },
    },

    {
      name: 'brackets-become-dashes',
      async run({ assert }) {
        assert.equal(utilities.slugify('Array[0] access'), 'array-0-access');
      },
    },

    {
      name: 'ampersand-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify('Salt & Pepper'), 'salt-pepper');
      },
    },

    {
      name: 'hash-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify('issue #42'), 'issue-42');
      },
    },

    {
      name: 'at-sign-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify('user@example.com'), 'user-example-com');
      },
    },

    // ─── Unicode / non-ASCII ───

    {
      name: 'em-dash-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify('Title — Subtitle'), 'title-subtitle');
      },
    },

    {
      name: 'curly-quotes-become-dashes',
      async run({ assert }) {
        assert.equal(utilities.slugify('“Hello”'), 'hello');
      },
    },

    {
      name: 'emoji-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify('Rocket 🚀 launch'), 'rocket-launch');
      },
    },

    {
      name: 'accented-chars-become-dashes',
      async run({ assert }) {
        // Slugify is ASCII-only by design — accents get stripped to dashes
        // (Future improvement could be to transliterate, but current behavior is documented here)
        assert.equal(utilities.slugify('café'), 'caf');
      },
    },

    // ─── Whitespace variants ───

    {
      name: 'tab-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify('foo\tbar'), 'foo-bar');
      },
    },

    {
      name: 'newline-becomes-dash',
      async run({ assert }) {
        assert.equal(utilities.slugify('foo\nbar'), 'foo-bar');
      },
    },

    {
      name: 'multiple-spaces-collapse',
      async run({ assert }) {
        assert.equal(utilities.slugify('foo    bar'), 'foo-bar');
      },
    },

    {
      name: 'mixed-whitespace-collapses',
      async run({ assert }) {
        assert.equal(utilities.slugify('foo \t \n bar'), 'foo-bar');
      },
    },

    // ─── Edge cases / non-string input ───

    {
      name: 'empty-string-returns-empty',
      async run({ assert }) {
        assert.equal(utilities.slugify(''), '');
      },
    },

    {
      name: 'all-punctuation-returns-empty',
      async run({ assert }) {
        assert.equal(utilities.slugify('!@#$%^&*()'), '');
      },
    },

    {
      name: 'only-dashes-returns-empty',
      async run({ assert }) {
        assert.equal(utilities.slugify('-----'), '');
      },
    },

    {
      name: 'only-whitespace-returns-empty',
      async run({ assert }) {
        assert.equal(utilities.slugify('   '), '');
      },
    },

    {
      name: 'null-returns-empty-string',
      async run({ assert }) {
        assert.equal(utilities.slugify(null), '');
      },
    },

    {
      name: 'undefined-returns-empty-string',
      async run({ assert }) {
        assert.equal(utilities.slugify(undefined), '');
      },
    },

    {
      name: 'number-returns-empty-string',
      async run({ assert }) {
        // Non-string input → empty string (caller is responsible for stringifying)
        assert.equal(utilities.slugify(42), '');
      },
    },

    {
      name: 'object-returns-empty-string',
      async run({ assert }) {
        assert.equal(utilities.slugify({ foo: 'bar' }), '');
      },
    },

    {
      name: 'array-returns-empty-string',
      async run({ assert }) {
        assert.equal(utilities.slugify(['hello']), '');
      },
    },

    // ─── Real-world examples ───

    {
      name: 'real-blog-post-title',
      async run({ assert }) {
        assert.equal(
          utilities.slugify('10 Best Productivity Apps for Students in 2025'),
          '10-best-productivity-apps-for-students-in-2025',
        );
      },
    },

    {
      name: 'real-blog-post-with-colon-and-slash',
      async run({ assert }) {
        assert.equal(
          utilities.slugify('Beginner\'s Guide: Python vs JavaScript'),
          'beginner-s-guide-python-vs-javascript',
        );
      },
    },

    {
      name: 'real-image-alt-text',
      async run({ assert }) {
        // The downloadImage() caller uses slugify(alt) to build a tmp filename
        assert.equal(
          utilities.slugify('Diagram showing the user flow (v2)'),
          'diagram-showing-the-user-flow-v2',
        );
      },
    },

    {
      name: 'real-url-with-blog-prefix-removed-first',
      async run({ assert }) {
        // Mimics how callers strip "blog/" before slugifying
        const url = 'blog/some-existing-post';
        assert.equal(
          utilities.slugify(url.replace(/blog\//ig, '')),
          'some-existing-post',
        );
      },
    },

    // ─── Idempotency ───

    {
      name: 'idempotent-double-slugify',
      async run({ assert }) {
        const once = utilities.slugify('Hello World: Foo & Bar!');
        const twice = utilities.slugify(once);
        assert.equal(twice, once, 'Applying slugify twice should equal applying it once');
      },
    },
  ],
};
