# Admin Post Route

The `POST /admin/post` route creates blog posts via GitHub's API. It handles image extraction, resize, upload, and body rewriting.

**Consumers.** Besides direct admin/blogger HTTP calls, this route is the publish target for the **Ghostii article engine** (`src/manager/libraries/content/ghostii.js` → `publishArticle()`), which is used by two paths: the standalone daily `ghostii-auto-publisher.js` cron (off by default), and the newsletter generator's linked-article flow (`marketing.beehiiv.content.article.enabled`). Both POST `title`/`url`/`description`/`headerImageURL`/`body`/`author`/`categories`/`tags`/`postPath`/`githubUser`/`githubRepo` with a `backendManagerKey`. Note: `headerImageURL` MUST resolve to a `.jpg` (the downloader rejects non-`.jpg` headers); Ghostii's `unsplash` hero satisfies this. See [docs/marketing-campaigns.md](marketing-campaigns.md).

**Ghostii is unopinionated about BEM.** Its `/write/article` response is a generic article — a `json` block array (`[{ name, content }]` where name ∈ `heading-1..6`/`image`/`paragraph`/`blockquote`/`list`) plus top-level `title`/`description`/`headerImageUrl`/`images`/`categories`/`keywords`. BEM owns the transform into this route's shape: `blocksToPost(article.json)` extracts the `heading-1` as the title, the first `image` block as `headerImageURL`, and joins every remaining block as the `body` (content only — NO title, NO header image embedded, since this route adds those itself; section images stay in the body and are extracted normally). Older Ghostii responses without `json` fall back to the flat `article.{title,body,headerImageUrl}` fields.

## Image Processing Flow

1. Receives markdown body with external image URLs (e.g., `![alt](https://images.unsplash.com/...)`)
2. Extracts all `![alt](url)` patterns from the body using regex
3. Downloads each image to a tmp dir
4. **Resizes** each image in place if its long edge exceeds `IMAGE_MAX_DIMENSION` (see below)
5. Commits all images to `src/assets/images/blog/post-{id}/` on GitHub (single commit via Git Trees API)
6. **Rewrites the body** to replace external URLs with `@post/{filename}` format
7. The `@post/` prefix is resolved at Jekyll build time by `jekyll-uj-powertools` to the full path

## Image resize

Sources from guest-post submissions can be enormous (16384×10576 has been seen in the wild — ~520MB raw RGB). Sources that large stall downstream Jekyll/imagemin pipelines on the consumer site, which silently ship the site missing those images.

To prevent this, every downloaded image is checked against `IMAGE_MAX_DIMENSION` (4096px on the long edge) and re-encoded as a progressive JPEG at `IMAGE_JPEG_QUALITY` (80) if it exceeds the limit. Images already at or below the limit pass through untouched.

The resize happens in `downloadImage()` (after the `.jpg` extension check, before returning to the caller), so:
- The base64 content that gets committed to GitHub is the resized version
- The consumer repo never sees the giant source
- Future downstream optimization (UJM imagemin, etc.) starts from a sane source size

Constants live in `src/manager/routes/admin/post/post.js`:
```js
const IMAGE_MAX_DIMENSION = 4096;
const IMAGE_JPEG_QUALITY = 80;
```

If these need to become configurable later, promote to `backend-manager-config.json` rather than env vars (deploy-environment-specific overrides aren't a real use case — the values are algorithm constants).

## Key Details

- Image filenames are derived from `hyphenate(alt_text)` + downloaded extension
- Only `.jpg` is accepted; other formats reject with a 400
- Header image (`headerImageURL`) is uploaded but NOT rewritten in the body (it's in frontmatter)
- Failed image downloads are skipped — the original external URL stays in the body
- All images + the post markdown are committed in a single commit via the Git Trees API

## Files

- `src/manager/routes/admin/post/post.js` — POST handler (create), includes `downloadImage()` + `resizeImage()` helpers
- `src/manager/routes/admin/post/put.js` — PUT handler (edit) — does NOT download images, just edits frontmatter/body in place
- `src/manager/routes/admin/post/templates/post.html` — Post template
