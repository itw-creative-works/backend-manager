/**
 * Test: routes/admin/post/post.formatImageDownloadError
 * Unit tests for the readable image-download error messages used by the
 * admin/post route.
 *
 * Run (from the framework repo): npm test routes/admin/post-download-error
 *
 * Contract:
 *   - Raw HTML error bodies (CDN 404 pages) are stripped to their text, so
 *     consumers surface "Could not download image (<url>): 404" instead of
 *     markup that downstream HTML rendering swallows.
 *   - The failing image URL is always included so the caller knows WHICH
 *     image broke.
 *   - Long reasons are truncated; empty reasons fall back to "unknown error".
 */
const post = require('../../../src/manager/routes/admin/post/post');

const { formatImageDownloadError } = post;

const SRC = 'https://images.unsplash.com/photos/ux-prism-qv5lQ4DwOS8';

module.exports = {
  description: 'routes/admin/post/post.formatImageDownloadError',
  type: 'group',

  tests: [
    {
      name: 'strips-html-404-body',
      async run({ assert }) {
        // The exact CDN response body from a real failed sponsorship publish
        const err = new Error('<html><body>404</body></html>');

        assert.equal(
          formatImageDownloadError(SRC, err),
          `Could not download image (${SRC}): 404`,
          'HTML tags are stripped, the status text and image URL survive',
        );
      },
    },

    {
      name: 'plain-message-passes-through',
      async run({ assert }) {
        assert.equal(
          formatImageDownloadError(SRC, new Error('socket hang up')),
          `Could not download image (${SRC}): socket hang up`,
          'Plain reasons are included as-is',
        );
      },
    },

    {
      name: 'truncates-long-reasons',
      async run({ assert }) {
        const result = formatImageDownloadError(SRC, new Error('x'.repeat(500)));

        assert.ok(result.endsWith('...'), 'Truncated reasons end with an ellipsis');
        assert.ok(result.length < 300, 'Reason is capped well below the raw length');
      },
    },

    {
      name: 'empty-reason-falls-back',
      async run({ assert }) {
        assert.equal(
          formatImageDownloadError(SRC, new Error('<html></html>')),
          `Could not download image (${SRC}): unknown error`,
          'Tag-only bodies fall back to a generic reason',
        );
        assert.equal(
          formatImageDownloadError(SRC, new Error('')),
          `Could not download image (${SRC}): unknown error`,
          'Empty messages fall back to a generic reason (not the stringified "Error")',
        );
      },
    },

    {
      name: 'handles-non-error-values',
      async run({ assert }) {
        assert.equal(
          formatImageDownloadError(SRC, 'ECONNRESET'),
          `Could not download image (${SRC}): ECONNRESET`,
          'Plain string rejections are handled',
        );
      },
    },
  ],
};
