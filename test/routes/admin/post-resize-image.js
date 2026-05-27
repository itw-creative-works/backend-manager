/**
 * Test: routes/admin/post/post.resizeImage
 * Unit tests for the in-place image resize used by the admin/post route.
 *
 * Run: npx mgr test routes/admin/post-resize-image
 *
 * Contract:
 *   - Images with both dimensions <= IMAGE_MAX_DIMENSION pass through untouched.
 *   - Images with either dimension > IMAGE_MAX_DIMENSION are resized in place,
 *     preserving aspect ratio, with the long edge clamped to IMAGE_MAX_DIMENSION.
 *   - Resize re-encodes as JPEG at IMAGE_JPEG_QUALITY (lossy is expected).
 *   - The file at the original path is overwritten with the resized bytes.
 */
const os = require('os');
const path = require('path');
const jetpack = require('fs-jetpack');
const sharp = require('sharp');

const post = require('../../../src/manager/routes/admin/post/post');

const { resizeImage, IMAGE_MAX_DIMENSION, IMAGE_JPEG_QUALITY } = post;

// Generate a synthetic JPEG of the given dimensions and write it to a tmp path.
// Returns the absolute path on disk.
async function makeJpeg(width, height) {
  const filepath = path.join(os.tmpdir(), `bem-test-resize-${Date.now()}-${width}x${height}.jpg`);
  const buffer = await sharp({
    create: {
      width: width,
      height: height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  jetpack.write(filepath, buffer);
  return filepath;
}

// Minimal assistant stub — resizeImage only uses Manager.require + log.
function makeAssistant() {
  return {
    log: () => {},
    Manager: {
      require: (mod) => require(mod),
    },
  };
}

module.exports = {
  description: 'routes/admin/post/post.resizeImage',
  type: 'group',

  tests: [
    // ─── Constants exposed ───

    {
      name: 'exports-constants',
      async run({ assert }) {
        assert.equal(IMAGE_MAX_DIMENSION, 4096, 'IMAGE_MAX_DIMENSION should be 4096');
        assert.equal(IMAGE_JPEG_QUALITY, 80, 'IMAGE_JPEG_QUALITY should be 80');
        assert.isType(resizeImage, 'function', 'resizeImage should be exported as a function');
      },
    },

    // ─── Pass-through: image already within bounds ───

    {
      name: 'small-image-passes-through-untouched',
      async run({ assert }) {
        const filepath = await makeJpeg(800, 600);
        const sizeBefore = jetpack.inspect(filepath).size;

        const result = await resizeImage(makeAssistant(), filepath);

        assert.equal(result.resized, false, 'Small image should not be resized');
        assert.equal(result.width, 800, 'Width should be reported as-is');
        assert.equal(result.height, 600, 'Height should be reported as-is');

        const sizeAfter = jetpack.inspect(filepath).size;
        assert.equal(sizeAfter, sizeBefore, 'File on disk should be byte-identical (no re-encode)');

        jetpack.remove(filepath);
      },
    },

    {
      name: 'image-exactly-at-max-passes-through',
      async run({ assert }) {
        // Long edge exactly === IMAGE_MAX_DIMENSION → no resize (boundary condition)
        const filepath = await makeJpeg(IMAGE_MAX_DIMENSION, 2000);

        const result = await resizeImage(makeAssistant(), filepath);

        assert.equal(result.resized, false, 'Image exactly at the limit should not be resized');
        assert.equal(result.width, IMAGE_MAX_DIMENSION, 'Width unchanged');

        jetpack.remove(filepath);
      },
    },

    // ─── Resize: landscape (width > height) ───

    {
      name: 'landscape-oversized-is-resized-to-max-width',
      async run({ assert }) {
        // 8000x4000 landscape → long edge is width → clamp width to 4096, scale height proportionally to 2048
        const filepath = await makeJpeg(8000, 4000);

        const result = await resizeImage(makeAssistant(), filepath);

        assert.equal(result.resized, true, 'Oversized landscape should be resized');
        assert.equal(result.width, IMAGE_MAX_DIMENSION, 'Width clamped to IMAGE_MAX_DIMENSION');
        assert.equal(result.height, IMAGE_MAX_DIMENSION / 2, 'Height scaled proportionally (8000:4000 → 4096:2048)');

        // Verify the file on disk was actually overwritten
        const meta = await sharp(filepath).metadata();
        assert.equal(meta.width, IMAGE_MAX_DIMENSION, 'On-disk width matches reported width');
        assert.equal(meta.height, IMAGE_MAX_DIMENSION / 2, 'On-disk height matches reported height');
        assert.equal(meta.format, 'jpeg', 'On-disk format is JPEG');

        jetpack.remove(filepath);
      },
    },

    // ─── Resize: portrait (height > width) ───

    {
      name: 'portrait-oversized-is-resized-to-max-height',
      async run({ assert }) {
        // 4000x8000 portrait → long edge is height → clamp height to 4096, width proportionally to 2048
        const filepath = await makeJpeg(4000, 8000);

        const result = await resizeImage(makeAssistant(), filepath);

        assert.equal(result.resized, true, 'Oversized portrait should be resized');
        assert.equal(result.width, IMAGE_MAX_DIMENSION / 2, 'Width scaled proportionally');
        assert.equal(result.height, IMAGE_MAX_DIMENSION, 'Height clamped to IMAGE_MAX_DIMENSION');

        jetpack.remove(filepath);
      },
    },

    // ─── Resize: huge image (the bug we are guarding against) ───

    {
      name: 'huge-image-is-resized-down',
      async run({ assert }) {
        // 16384x10576 — the actual size from post-1779087609 (the-importance-of-feedback-loops).
        // Raw RGB this size is ~520MB, which is what stalled UJM's imagemin stream.
        const filepath = await makeJpeg(16384, 10576);
        const sizeBefore = jetpack.inspect(filepath).size;

        const result = await resizeImage(makeAssistant(), filepath);

        assert.equal(result.resized, true, 'Huge image should be resized');
        assert.equal(result.width, IMAGE_MAX_DIMENSION, 'Long edge clamped to IMAGE_MAX_DIMENSION');
        // 16384:10576 ratio → height = 4096 * (10576/16384) = 2644
        assert.inRange(result.height, 2643, 2645, 'Height scaled proportionally (within rounding)');

        const sizeAfter = jetpack.inspect(filepath).size;
        assert.ok(sizeAfter < sizeBefore, 'Resized file on disk should be smaller than original');

        jetpack.remove(filepath);
      },
    },

    // ─── Square images ───

    {
      name: 'square-oversized-is-resized-to-square',
      async run({ assert }) {
        const filepath = await makeJpeg(8000, 8000);

        const result = await resizeImage(makeAssistant(), filepath);

        assert.equal(result.resized, true, 'Oversized square should be resized');
        assert.equal(result.width, IMAGE_MAX_DIMENSION, 'Width clamped');
        assert.equal(result.height, IMAGE_MAX_DIMENSION, 'Height clamped');

        jetpack.remove(filepath);
      },
    },
  ],
};
