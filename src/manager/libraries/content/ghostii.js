/**
 * Ghostii article engine — shared helpers for AI article generation + publishing.
 *
 * Ghostii (api.ghostii.ai) is UNOPINIONATED about BEM. It returns a generic,
 * structured article: a `json` block array ([{ name, content }]) plus `title`,
 * `description`, `headerImageUrl`, `categories`, `keywords`. It is NOT shaped to
 * BEM's post format — BEM is responsible for transforming Ghostii's output into
 * what its `admin/post` route expects.
 *
 * `blocksToPost()` is that transform: it digests the JSON blocks and pulls out
 * the title (heading-1), the header image (first image block), and the clean
 * body (every remaining block — sections, paragraphs, section images, quotes —
 * joined as markdown, with NO title or header image embedded, since admin/post
 * adds those itself from the separate `title`/`headerImageURL` fields).
 *
 * Two consumers:
 *   - events/cron/daily/ghostii-auto-publisher.js — standalone daily article job
 *   - libraries/email/generators/newsletter.js    — newsletter-driven linked article
 *
 * Both call writeArticle() then publishArticle(). Kept here as the single source
 * of truth for the Ghostii request shape and the admin/post payload.
 */
const fetch = require('wonderful-fetch');
const powertools = require('node-powertools');

/**
 * Generate an article via the Ghostii API.
 *
 * @param {object} args
 * @param {object} args.brand - Public brand config ({ brand: { url, ... }, github: { ... } })
 * @param {string} args.description - The article brief / prompt content
 * @param {string[]} [args.links] - Optional links to inject into the article body
 * @returns {Promise<object>} Ghostii's generic article response:
 *   { title, description, body, json, headerImageUrl, images, categories, keywords, links, outline }
 *   where `json` is the structured block array ([{ name, content }]) that
 *   blocksToPost() consumes to build BEM's post shape.
 */
function writeArticle({ brand, description, links }) {
  return fetch('https://api.ghostii.ai/write/article', {
    method: 'post',
    timeout: 180000,
    tries: 1,
    response: 'json',
    body: {
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
      keywords: [''],
      description: description,
      insertLinks: true,
      research: true,
      insertImages: true,
      length: 'long',
      maxLinks: 6,
      headerImageUrl: 'unsplash',
      url: brand.brand.url,
      sectionQuantity: powertools.random(3, 6, { mode: 'gaussian' }),
      feedUrl: `${brand.brand.url}/feeds/posts.json`,
      links: links || [],
    },
  });
}

/**
 * Transform Ghostii's generic JSON block array into BEM's post shape.
 *
 * Ghostii returns `json: [{ name, content }]` where name ∈ heading-1..6, image,
 * paragraph, blockquote, list. BEM's admin/post wants the title + header image as
 * SEPARATE fields and a body that is ONLY the content below them. So we extract:
 *   - title       ← first heading-1 block (markdown `#` stripped)
 *   - headerImageUrl ← first image block's URL
 *   - body        ← every remaining block, joined as markdown
 *
 * @param {Array} json - Ghostii's block array.
 * @returns {{ title: string, headerImageUrl: string, body: string }}
 */
function blocksToPost(json) {
  const blocks = Array.isArray(json) ? json : [];

  const titleBlock = blocks.find((b) => b.name === 'heading-1');
  const imageBlock = blocks.find((b) => b.name === 'image');

  // Title: strip the leading markdown heading marker.
  const title = (titleBlock?.content || '').replace(/^#+\s*/, '').trim();

  // Header image: pull the URL out of `![alt](url)`.
  const imageMatch = (imageBlock?.content || '').match(/\((.*?)\)\s*$/);
  const headerImageUrl = imageMatch ? imageMatch[1] : '';

  // Body: everything except the title block and the header-image block.
  const body = blocks
    .filter((b) => b !== titleBlock && b !== imageBlock)
    .map((b) => b.content)
    .join('\n\n')
    .trim();

  return { title, headerImageUrl, body };
}

/**
 * Publish a Ghostii article to the brand's website repo via the admin/post route.
 *
 * @param {object} assistant - BEM assistant instance
 * @param {object} args
 * @param {object} args.brand - Public brand config ({ brand: { url, ... }, github: { user, repo } })
 * @param {object} args.article - The article from writeArticle(). When it carries a
 *   `json` block array, the post is reconstructed via blocksToPost() (title + header
 *   image extracted, body = content only). Falls back to article.{title,body,headerImageUrl}.
 * @param {number} args.id - Post ID (unix timestamp)
 * @param {string} [args.author] - Author slug (admin/post picks a default if unset)
 * @param {string} [args.postPath='ghostii'] - Sub-folder under _posts/{year}/
 * @returns {Promise<object>} { post, url, slug, path } — `url` is the public blog URL
 */
async function publishArticle(assistant, { brand, article, id, author, postPath }) {
  const baseUrl = (brand.brand.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const apiUrl = `https://api.${baseUrl}`;

  // Transform Ghostii's generic JSON into BEM's post shape (title + header image
  // as separate fields, body = content only). Fall back to the legacy flat fields
  // for older Ghostii responses that don't include `json`.
  const post = blocksToPost(article.json);
  const title = post.title || article.title;
  const headerImageUrl = post.headerImageUrl || article.headerImageUrl;
  const body = article.json ? post.body : article.body;

  const result = await fetch(`${apiUrl}/backend-manager/admin/post`, {
    method: 'POST',
    timeout: 90000,
    tries: 1,
    response: 'json',
    body: {
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
      title: title,
      url: title, // Slugified on the admin/post endpoint
      description: article.description,
      headerImageURL: headerImageUrl,
      body: body,
      id: id,
      author: author,
      categories: article.categories,
      tags: article.keywords,
      postPath: postPath || 'ghostii',
      githubUser: brand.github.user,
      githubRepo: brand.github.repo,
    },
  });

  // admin/post returns the resolved `settings` (incl. the slugified `url` and repo `path`).
  // The post template sets no permalink, so the public URL follows the Jekyll/UJM
  // blog convention: {brand.url}/blog/{slug}.
  const slug = result?.url || '';
  const publicUrl = `${(brand.brand.url || '').replace(/\/$/, '')}/blog/${slug}`;

  return {
    post: result,
    url: slug ? publicUrl : null,
    slug,
    path: result?.path || null,
  };
}

module.exports = { writeArticle, publishArticle, blocksToPost };
