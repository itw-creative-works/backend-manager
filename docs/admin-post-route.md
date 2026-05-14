# Admin Post Route

The `POST /admin/post` route creates blog posts via GitHub's API. It handles image extraction, upload, and body rewriting.

## Image Processing Flow

1. Receives markdown body with external image URLs (e.g., `![alt](https://images.unsplash.com/...)`)
2. Extracts all `![alt](url)` patterns from the body using regex
3. Downloads each image and uploads it to `src/assets/images/blog/post-{id}/` on GitHub
4. **Rewrites the body** to replace external URLs with `@post/{filename}` format
5. The `@post/` prefix is resolved at Jekyll build time by `jekyll-uj-powertools` to the full path

## Key Details

- Image filenames are derived from `hyphenate(alt_text)` + downloaded extension
- Header image (`headerImageURL`) is uploaded but NOT rewritten in the body (it's in frontmatter)
- Failed image downloads are skipped — the original external URL stays in the body
- The `extractImages()` function returns a URL mapping used for body rewriting

## Files

- `src/manager/routes/admin/post/post.js` — POST handler (create)
- `src/manager/routes/admin/post/put.js` — PUT handler (edit)
- `src/manager/routes/admin/post/templates/post.html` — Post template
