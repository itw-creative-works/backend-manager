/**
 * GET /content/post - Fetch blog post from GitHub
 * Public endpoint to retrieve blog post content
 */
const { Octokit } = require('@octokit/rest');
const { parse } = require('yaml');

module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const settings = assistant.settings;

  // Check for GitHub configuration
  if (!process.env.GITHUB_TOKEN) {
    return assistant.respond('GitHub API key not configured.', { code: 500 });
  }

  if (!Manager.config?.github?.repo_website) {
    return assistant.respond('GitHub repo_website not configured.', { code: 500 });
  }

  // Setup Octokit
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  // Check for required parameters
  if (!settings.url) {
    return assistant.respond('Missing required parameter: url', { code: 400 });
  }

  let url;
  try {
    url = new URL(settings.url);
  } catch (e) {
    return assistant.respond('Invalid URL', { code: 400 });
  }

  // Get the post
  const filename = url.pathname.replace(/blog|\//ig, '');
  const repoInfo = assistant.parseRepo(Manager.config.github.repo_website);
  const query = `title+repo:${repoInfo.user}/${repoInfo.name}+filename:${filename}`;

  assistant.log('Running search', query, repoInfo);

  // Search the repo for the file matching the url
  const results = await octokit.rest.search.code({
    q: query,
  }).catch(e => e);

  assistant.log('Results', results);

  // Check for errors
  if (results instanceof Error) {
    return assistant.respond(`Error searching for post: ${results}`, { code: 500 });
  }
  if (results?.data?.total_count === 0) {
    return assistant.respond('Post not found', { code: 404 });
  }

  // Get the first result
  const firstResult = results.data.items[0];

  // Fetch the content of the post
  const post = await octokit.rest.repos.getContent({
    owner: repoInfo.user,
    repo: repoInfo.name,
    path: firstResult.path,
  }).catch(e => e);

  assistant.log('Post', post);

  // Check for errors
  if (post instanceof Error) {
    return assistant.respond(`Error fetching post: ${post}`, { code: 500 });
  }

  // Decode the content
  const fullContent = Buffer.from(post.data.content, 'base64').toString();
  const splitContent = fullContent.split('---');
  const frontmatter = splitContent[1].trim();
  const body = splitContent.slice(2).join('---').trim();
  const parsed = parse(frontmatter);

  // Track analytics
  assistant.analytics.event('content/post', { action: 'get' });

  return assistant.respond({
    // Meta
    name: post.data.name,
    path: post.data.path,
    size: post.data.size,
    sha: post.data.sha,

    // Content
    frontmatter: frontmatter,
    body: body,

    // Parsed
    title: parsed.post.title,
    description: parsed.post.description,
    author: parsed.post.author,
    id: parsed.post.id,
    tags: parsed.post.tags,
    categories: parsed.post.categories,
  });
};
