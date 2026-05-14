/**
 * Deduplicate alt-text across DIFFERENT image URLs.
 *
 * Image filenames in the admin/post route are derived from the markdown image's
 * alt-text. Two images sharing alt-text would otherwise produce the same filename
 * and overwrite each other on upload, causing the second image to "disappear"
 * (both `@post/` references in the body resolve to the same file).
 *
 * Strategy: when a non-header image's alt collides with an earlier image's alt
 * AND its URL is different, suffix the alt with ` (N)` (where N is the
 * occurrence count). Same URL keeps its original alt — repeated embeds of the
 * exact same image are not a collision and should resolve to the same file.
 *
 * @param {Array<{src: string, alt: string, header?: boolean}>} images — image
 *   entries extracted from the body (plus optional header). Mutated in place:
 *   `image.alt` is rewritten when a collision is detected.
 * @param {string} body — markdown body string. Returned with any
 *   `![oldAlt](src)` rewritten to `![newAlt](src)` for collisions.
 * @returns {{images: Array, body: string}} mutated images array and rewritten body.
 */
module.exports = function deduplicateImageAlts(images, body) {
  const seenAltByUrl = new Map();
  const altCountByAlt = new Map();
  let rewrittenBody = body;

  for (const image of images) {
    if (image.header) {
      continue;
    }

    const existingForUrl = seenAltByUrl.get(image.src);
    if (existingForUrl) {
      // Same URL appeared earlier — reuse its (possibly already-suffixed) alt.
      // Repeated embeds of the same image should resolve to the same upload.
      image.alt = existingForUrl;
      continue;
    }

    const count = (altCountByAlt.get(image.alt) || 0) + 1;
    altCountByAlt.set(image.alt, count);

    if (count > 1) {
      const newAlt = `${image.alt} (${count})`;
      rewrittenBody = rewrittenBody.split(`![${image.alt}](${image.src})`).join(`![${newAlt}](${image.src})`);
      image.alt = newAlt;
    }

    seenAltByUrl.set(image.src, image.alt);
  }

  return { images, body: rewrittenBody };
};
