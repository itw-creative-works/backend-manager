/**
 * Test: routes/admin/post/post.convertToJpeg + applyImageCDNParams
 * Unit tests for non-JPG ingest conversion and CDN pre-scale params used by
 * the admin/post route.
 *
 * Run (from the framework repo): npm test routes/admin/post-convert-image
 *
 * Contract:
 *   - png/webp downloads are converted in place to progressive JPEG at
 *     IMAGE_JPEG_QUALITY; the result's path/filename/ext all become .jpg and
 *     the original file is removed.
 *   - Alpha channels are flattened onto white (JPEG has no transparency).
 *   - applyImageCDNParams adds w/q params for Unsplash and w/auto params for
 *     Pexels (without clobbering params already present), and leaves other
 *     hosts untouched.
 */
const os = require('os');
const path = require('path');
const jetpack = require('fs-jetpack');
const sharp = require('sharp');

const post = require('../../../src/manager/routes/admin/post/post');

const { convertToJpeg, applyImageCDNParams, IMAGE_MAX_DIMENSION } = post;

// Generate a synthetic image of the given format and write it to a tmp path.
async function makeImage(format, options) {
  const filepath = path.join(os.tmpdir(), `bem-test-convert-${Date.now()}-${Math.random().toString(36).slice(2)}.${format}`);
  const buffer = await sharp({
    create: {
      width: 640,
      height: 480,
      channels: options?.alpha ? 4 : 3,
      background: options?.alpha
        ? { r: 200, g: 50, b: 50, alpha: 0.5 }
        : { r: 200, g: 50, b: 50 },
    },
  })[format]()
    .toBuffer();

  jetpack.write(filepath, buffer);
  return filepath;
}

// Minimal assistant stub — convertToJpeg only uses Manager.require + log.
function makeAssistant() {
  return {
    log: () => {},
    Manager: {
      require: (mod) => require(mod),
    },
  };
}

module.exports = {
  description: 'routes/admin/post/post.convertToJpeg + applyImageCDNParams',
  type: 'group',

  tests: [
    // ─── convertToJpeg ───

    {
      name: 'png-converts-to-jpg',
      async run({ assert }) {
        const filepath = await makeImage('png');
        const result = { path: filepath, filename: path.basename(filepath), ext: '.png' };

        await convertToJpeg(makeAssistant(), result);

        assert.equal(result.ext, '.jpg', 'ext should become .jpg');
        assert.ok(result.path.endsWith('.jpg'), 'path should end with .jpg');
        assert.ok(result.filename.endsWith('.jpg'), 'filename should end with .jpg');
        assert.ok(jetpack.exists(result.path), 'converted file should exist');
        assert.equal(jetpack.exists(filepath), false, 'original .png should be removed');

        const meta = await sharp(result.path).metadata();
        assert.equal(meta.format, 'jpeg', 'on-disk format should be JPEG');
        assert.equal(meta.width, 640, 'dimensions should be preserved');

        jetpack.remove(result.path);
      },
    },

    {
      name: 'webp-converts-to-jpg',
      async run({ assert }) {
        const filepath = await makeImage('webp');
        const result = { path: filepath, filename: path.basename(filepath), ext: '.webp' };

        await convertToJpeg(makeAssistant(), result);

        assert.equal(result.ext, '.jpg', 'ext should become .jpg');
        const meta = await sharp(result.path).metadata();
        assert.equal(meta.format, 'jpeg', 'on-disk format should be JPEG');
        assert.equal(jetpack.exists(filepath), false, 'original .webp should be removed');

        jetpack.remove(result.path);
      },
    },

    {
      name: 'alpha-png-flattens-onto-white',
      async run({ assert }) {
        const filepath = await makeImage('png', { alpha: true });
        const result = { path: filepath, filename: path.basename(filepath), ext: '.png' };

        await convertToJpeg(makeAssistant(), result);

        const meta = await sharp(result.path).metadata();
        assert.equal(meta.format, 'jpeg', 'on-disk format should be JPEG');
        assert.equal(meta.channels, 3, 'alpha channel should be gone');

        // 50%-alpha red over white ≈ light red — the green/blue channels must be
        // well above 0 (a black flatten would leave them near 25).
        const { channels } = await sharp(result.path).stats();
        assert.ok(channels[1].mean > 100, `green mean should reflect a white flatten (got ${Math.round(channels[1].mean)})`);

        jetpack.remove(result.path);
      },
    },

    // ─── applyImageCDNParams ───

    {
      name: 'unsplash-gets-w-and-q-params',
      async run({ assert }) {
        const out = new URL(applyImageCDNParams('https://images.unsplash.com/photo-123'));
        assert.equal(out.searchParams.get('w'), String(IMAGE_MAX_DIMENSION), 'w param should be the max dimension');
        assert.ok(out.searchParams.get('q'), 'q param should be set');
      },
    },

    {
      name: 'pexels-gets-w-and-auto-params',
      async run({ assert }) {
        const out = new URL(applyImageCDNParams('https://images.pexels.com/photos/416405/pexels-photo-416405.jpeg'));
        assert.equal(out.searchParams.get('w'), String(IMAGE_MAX_DIMENSION), 'w param should be the max dimension');
        assert.equal(out.searchParams.get('auto'), 'compress', 'auto=compress should be set');
      },
    },

    {
      name: 'existing-params-are-not-clobbered',
      async run({ assert }) {
        const out = new URL(applyImageCDNParams('https://images.pexels.com/photos/1/a.jpeg?w=800'));
        assert.equal(out.searchParams.get('w'), '800', 'an existing w param should be preserved');
      },
    },

    {
      name: 'other-hosts-untouched',
      async run({ assert }) {
        const src = 'https://cdn.pixabay.com/photo/2024/01/01/example.jpg';
        assert.equal(applyImageCDNParams(src), src, 'hosts without CDN param support should pass through unchanged');
      },
    },
  ],
};
