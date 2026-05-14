/**
 * Test: routes/admin/post/deduplicate-image-alts
 * Unit tests for the alt-text dedup helper used by the admin/post route.
 *
 * Run: npx mgr test routes/admin/deduplicate-image-alts
 *
 * Contract:
 *   - Header images are never modified.
 *   - Two non-header images with the same alt AND different URLs:
 *     the second's alt is suffixed with " (2)" (and " (3)" for the third, etc.)
 *     and the body is rewritten to match.
 *   - Two non-header images with the same alt AND the same URL:
 *     the second reuses the first's (possibly already-suffixed) alt — no change.
 *   - Images with distinct alts are untouched.
 */
const deduplicateImageAlts = require('../../../src/manager/routes/admin/post/deduplicate-image-alts');

module.exports = {
  description: 'routes/admin/post/deduplicate-image-alts',
  type: 'group',

  tests: [
    // ─── Happy path: no collisions ───

    {
      name: 'distinct-alts-are-untouched',
      async run({ assert }) {
        const images = [
          { src: 'https://a.com/1.jpg', alt: 'Cat', header: false },
          { src: 'https://a.com/2.jpg', alt: 'Dog', header: false },
        ];
        const body = '![Cat](https://a.com/1.jpg)\n\n![Dog](https://a.com/2.jpg)';
        const result = deduplicateImageAlts(images, body);

        assert.equal(result.images[0].alt, 'Cat', 'First image alt unchanged');
        assert.equal(result.images[1].alt, 'Dog', 'Second image alt unchanged');
        assert.equal(result.body, body, 'Body is unchanged when no collisions');
      },
    },

    // ─── The bug: same alt, different URLs ───

    {
      name: 'same-alt-different-urls-suffixes-second',
      async run({ assert }) {
        const sharedAlt = '62f9b399-92c2-40c2-8ec4-e05b54077aaa';
        const images = [
          { src: 'https://a.com/1.jpg', alt: sharedAlt, header: false },
          { src: 'https://a.com/2.jpg', alt: sharedAlt, header: false },
        ];
        const body = `![${sharedAlt}](https://a.com/1.jpg)\n\nsome text\n\n![${sharedAlt}](https://a.com/2.jpg)`;
        const result = deduplicateImageAlts(images, body);

        assert.equal(result.images[0].alt, sharedAlt, 'First image keeps original alt');
        assert.equal(result.images[1].alt, `${sharedAlt} (2)`, 'Second image alt is suffixed with " (2)"');
        assert.ok(
          result.body.includes(`![${sharedAlt}](https://a.com/1.jpg)`),
          'Body still contains the first image with original alt',
        );
        assert.ok(
          result.body.includes(`![${sharedAlt} (2)](https://a.com/2.jpg)`),
          'Body contains the second image with suffixed alt',
        );
      },
    },

    {
      name: 'three-images-same-alt-different-urls-counts-up',
      async run({ assert }) {
        const sharedAlt = 'Logo';
        const images = [
          { src: 'https://a.com/1.jpg', alt: sharedAlt, header: false },
          { src: 'https://a.com/2.jpg', alt: sharedAlt, header: false },
          { src: 'https://a.com/3.jpg', alt: sharedAlt, header: false },
        ];
        const body = `![${sharedAlt}](https://a.com/1.jpg)\n![${sharedAlt}](https://a.com/2.jpg)\n![${sharedAlt}](https://a.com/3.jpg)`;
        const result = deduplicateImageAlts(images, body);

        assert.equal(result.images[0].alt, 'Logo');
        assert.equal(result.images[1].alt, 'Logo (2)');
        assert.equal(result.images[2].alt, 'Logo (3)');
        assert.ok(result.body.includes('![Logo](https://a.com/1.jpg)'));
        assert.ok(result.body.includes('![Logo (2)](https://a.com/2.jpg)'));
        assert.ok(result.body.includes('![Logo (3)](https://a.com/3.jpg)'));
      },
    },

    // ─── Same alt, SAME URL: legitimate duplicate, no change ───

    {
      name: 'same-alt-same-url-is-not-a-collision',
      async run({ assert }) {
        const sharedAlt = 'Logo';
        const sharedUrl = 'https://a.com/logo.jpg';
        const images = [
          { src: sharedUrl, alt: sharedAlt, header: false },
          { src: sharedUrl, alt: sharedAlt, header: false },
        ];
        const body = `![${sharedAlt}](${sharedUrl})\n\n![${sharedAlt}](${sharedUrl})`;
        const result = deduplicateImageAlts(images, body);

        assert.equal(result.images[0].alt, sharedAlt, 'First image alt unchanged');
        assert.equal(result.images[1].alt, sharedAlt, 'Second image alt unchanged (same URL)');
        assert.equal(result.body, body, 'Body unchanged when URLs match');
      },
    },

    // ─── Header image is never touched ───

    {
      name: 'header-image-with-shared-alt-is-not-modified',
      async run({ assert }) {
        const sharedAlt = 'banner';
        const images = [
          { src: 'https://a.com/header.jpg', alt: sharedAlt, header: true },
          { src: 'https://a.com/body.jpg', alt: sharedAlt, header: false },
        ];
        const body = `![${sharedAlt}](https://a.com/body.jpg)`;
        const result = deduplicateImageAlts(images, body);

        assert.equal(result.images[0].alt, sharedAlt, 'Header image alt unchanged');
        assert.equal(
          result.images[1].alt,
          sharedAlt,
          'Body image alt unchanged because header is excluded from collision tracking',
        );
        assert.equal(result.body, body, 'Body unchanged');
      },
    },

    // ─── Mixed scenarios ───

    {
      name: 'mixed-A-B-A-C-only-C-collides-with-A-once',
      async run({ assert }) {
        // Pattern: A, B, A (same URL as first A), C (different URL, same alt as A)
        // Expected: A and A reuse, C gets " (2)" suffix because its alt collides with A.
        const altA = 'Shared';
        const altB = 'Other';
        const urlA = 'https://a.com/a.jpg';
        const urlB = 'https://a.com/b.jpg';
        const urlC = 'https://a.com/c.jpg';

        const images = [
          { src: urlA, alt: altA, header: false },
          { src: urlB, alt: altB, header: false },
          { src: urlA, alt: altA, header: false }, // Same URL as image 1 — legit duplicate
          { src: urlC, alt: altA, header: false }, // Different URL, same alt — collision
        ];
        const body = `![${altA}](${urlA})\n![${altB}](${urlB})\n![${altA}](${urlA})\n![${altA}](${urlC})`;
        const result = deduplicateImageAlts(images, body);

        assert.equal(result.images[0].alt, altA, 'Image 1 unchanged');
        assert.equal(result.images[1].alt, altB, 'Image 2 (different alt) unchanged');
        assert.equal(result.images[2].alt, altA, 'Image 3 (same URL as 1) unchanged');
        assert.equal(result.images[3].alt, `${altA} (2)`, 'Image 4 (different URL, same alt) gets " (2)"');
        assert.ok(result.body.includes(`![${altA} (2)](${urlC})`), 'Body has the C image with suffixed alt');
      },
    },

    // ─── Edge cases ───

    {
      name: 'empty-images-array-returns-empty',
      async run({ assert }) {
        const result = deduplicateImageAlts([], 'some body');
        assert.deepEqual(result.images, [], 'images is empty');
        assert.equal(result.body, 'some body', 'body unchanged');
      },
    },

    {
      name: 'no-collisions-among-different-alts',
      async run({ assert }) {
        const images = [
          { src: 'https://a.com/1.jpg', alt: 'A', header: false },
          { src: 'https://a.com/2.jpg', alt: 'B', header: false },
          { src: 'https://a.com/3.jpg', alt: 'C', header: false },
        ];
        const body = '![A](https://a.com/1.jpg)\n![B](https://a.com/2.jpg)\n![C](https://a.com/3.jpg)';
        const result = deduplicateImageAlts(images, body);

        assert.equal(result.images[0].alt, 'A');
        assert.equal(result.images[1].alt, 'B');
        assert.equal(result.images[2].alt, 'C');
        assert.equal(result.body, body, 'Body unchanged');
      },
    },
  ],
};
