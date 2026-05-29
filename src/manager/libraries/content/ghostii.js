/**
 * Ghostii article engine — shared helpers for AI article generation + publishing.
 *
 * Ghostii (api.ghostii.ai) writes a full blog article (title, body, header image,
 * categories, keywords) from a free-form description. We then publish it to the
 * brand's website repo via the internal `admin/post` route (commits markdown +
 * images to GitHub).
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
 * @returns {Promise<object>} { title, description, body, headerImageUrl, categories, keywords }
 */
function writeArticle({ brand, description, links }) {
  return fetch('https://api.ghostii.ai/write/article', {
    method: 'post',
    timeout: 90000,
    tries: 1,
    response: 'json',
    body: {
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
      keywords: [''],
      description: description,
      insertLinks: true,
      headerImageUrl: 'unsplash',
      url: brand.brand.url,
      sectionQuantity: powertools.random(3, 6, { mode: 'gaussian' }),
      feedUrl: `${brand.brand.url}/feeds/posts.json`,
      links: links || [],
    },
  });
}

/**
 * Publish a Ghostii article to the brand's website repo via the admin/post route.
 *
 * @param {object} assistant - BEM assistant instance
 * @param {object} args
 * @param {object} args.brand - Public brand config ({ brand: { url, ... }, github: { user, repo } })
 * @param {object} args.article - The article from writeArticle()
 * @param {number} args.id - Post ID (unix timestamp)
 * @param {string} [args.author] - Author slug (admin/post picks a default if unset)
 * @param {string} [args.postPath='ghostii'] - Sub-folder under _posts/{year}/
 * @returns {Promise<object>} { post, url, slug, path } — `url` is the public blog URL
 */
async function publishArticle(assistant, { brand, article, id, author, postPath }) {
  const baseUrl = (brand.brand.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const apiUrl = `https://api.${baseUrl}`;

  const post = await fetch(`${apiUrl}/backend-manager/admin/post`, {
    method: 'POST',
    timeout: 90000,
    tries: 1,
    response: 'json',
    body: {
      backendManagerKey: process.env.BACKEND_MANAGER_KEY,
      title: article.title,
      url: article.title, // Slugified on the admin/post endpoint
      description: article.description,
      headerImageURL: article.headerImageUrl,
      body: article.body,
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
  const slug = post?.url || '';
  const publicUrl = `${(brand.brand.url || '').replace(/\/$/, '')}/blog/${slug}`;

  return {
    post,
    url: slug ? publicUrl : null,
    slug,
    path: post?.path || null,
  };
}

module.exports = { writeArticle, publishArticle };
