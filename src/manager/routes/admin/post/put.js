/**
 * PUT /admin/post - Edit blog post
 * Admin/blogger endpoint to edit existing blog posts via GitHub
 */
const moment = require('moment');
const powertools = require('node-powertools');
const { Octokit } = require('@octokit/rest');

module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;
  const fetch = Manager.require('wonderful-fetch');

  // Require authentication
  if (!user.authenticated) {
    return assistant.respond('Authentication required', { code: 401 });
  }

  // Require admin or blogger
  if (!user.roles.admin && !user.roles.blogger) {
    return assistant.respond('Admin required.', { code: 403 });
  }

  // Check for GitHub configuration
  if (!process.env.GITHUB_TOKEN) {
    return assistant.respond('GitHub API key not configured.', { code: 500 });
  }

  if (!Manager.config?.github?.repo_website) {
    return assistant.respond('GitHub repo_website not configured.', { code: 500 });
  }

  assistant.log('main(): settings', settings);

  const now = assistant.meta.startTime.timestamp;
  const bemRepo = assistant.parseRepo(Manager.config.github.repo_website);

  // Setup Octokit
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  // Check for required values
  if (!settings.url) {
    return assistant.respond('Missing required parameter: url', { code: 400 });
  }
  if (!settings.body) {
    return assistant.respond('Missing required parameter: body', { code: 400 });
  }

  // Fix URL
  settings.url = settings.url
    .replace(/blog\//ig, '')
    .replace(/^\/|\/$/g, '')
    .trim();

  // Fix body
  settings.body = settings.body
    .replace(powertools.regexify(`/# ${settings.title}/i`), '')
    .replace(/\n\n\n+/g, '\n\n')
    .trim();

  // Fix other values
  settings.postPath = `_posts/${moment(now).format('YYYY')}/${settings.postPath || 'guest'}`;
  settings.githubUser = settings.githubUser || bemRepo.user;
  settings.githubRepo = settings.githubRepo || bemRepo.name;

  assistant.log('main(): Editing post...', settings);

  // Fetch existing post using NEW API format
  const fetchedPost = await fetchPost(Manager, assistant, settings.url).catch(e => e);
  if (fetchedPost instanceof Error) {
    return assistant.respond(fetchedPost.message, { code: fetchedPost.status || 404 });
  }

  // Upload post
  const uploadResult = await uploadPost(assistant, octokit, settings, fetchedPost).catch(e => e);
  if (uploadResult instanceof Error) {
    return assistant.respond(uploadResult.message, { code: uploadResult.status || 500 });
  }

  assistant.log('main(): uploadPost', uploadResult);

  // Track analytics
  assistant.analytics.event('admin/post', { action: 'edit' });

  return assistant.respond(settings);
};

// Helper: Fetch existing post
async function fetchPost(Manager, assistant, url) {
  const fetch = Manager.require('wonderful-fetch');

  // Use NEW API format
  const result = await fetch(`${Manager.project.apiUrl}/backend-manager/content/post`, {
    method: 'get',
    response: 'json',
    timeout: 190000,
    tries: 1,
    query: {
      url: url,
    },
  });

  assistant.log('fetchPost(): Result', result);

  return result;
}

// Helper: Upload post to GitHub
async function uploadPost(assistant, octokit, settings, fetchedPost) {
  const filename = fetchedPost.path;
  const sha = fetchedPost.sha;
  const frontmatter = fetchedPost.frontmatter;
  const owner = settings.githubUser;
  const repo = settings.githubRepo;

  // Combine content
  const fullContent = '---\n'
    + `${frontmatter}\n`
    + '---\n'
    + '\n'
    + settings.body;

  // Upload post
  const result = await octokit.rest.repos.createOrUpdateFileContents({
    owner: owner,
    repo: repo,
    path: filename,
    sha: sha,
    message: `📦 admin/post:edit ${filename}`,
    content: Buffer.from(fullContent).toString('base64'),
  });

  assistant.log('uploadPost(): Result', result);

  return result;
}
