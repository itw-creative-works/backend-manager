/**
 * POST /admin/repo/content - Write content to GitHub repo
 * Admin/blogger endpoint to write files to GitHub
 */
const { Octokit } = require('@octokit/rest');

module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const user = assistant.usage.user;
  const settings = assistant.settings;

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

  const bemRepo = assistant.parseRepo(Manager.config.github.repo_website);

  // Setup Octokit
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  // Check for required values
  if (!settings.path) {
    return assistant.respond('Missing required parameter: path', { code: 400 });
  }
  if (!settings.content) {
    return assistant.respond('Missing required parameter: content', { code: 400 });
  }

  // Fix other values
  settings.type = settings.type || 'text';
  settings.githubUser = settings.githubUser || bemRepo.user;
  settings.githubRepo = settings.githubRepo || bemRepo.name;

  assistant.log('main(): Creating file...', settings);

  // Upload content
  const uploadResult = await uploadContent(assistant, octokit, settings).catch(e => e);
  if (uploadResult instanceof Error) {
    return assistant.respond(uploadResult.message, { code: uploadResult.status || 500 });
  }

  assistant.log('main(): uploadContent', uploadResult);

  // Track analytics
  assistant.analytics.event('admin/repo/content', { action: 'write' });

  return assistant.respond(settings);
};

// Helper: Upload content to GitHub
async function uploadContent(assistant, octokit, settings) {
  const owner = settings.githubUser;
  const repo = settings.githubRepo;
  const filename = settings.path;
  const content = settings.content;

  assistant.log('uploadContent(): filename', filename);

  // Get existing file
  const existing = await octokit.rest.repos.getContent({
    owner: owner,
    repo: repo,
    path: filename,
  }).catch(e => e);

  assistant.log('uploadContent(): Existing', existing);

  // Quit if error and it's DIFFERENT than 404
  if (existing instanceof Error && existing?.status !== 404) {
    throw existing;
  }

  // Upload content
  const result = await octokit.rest.repos.createOrUpdateFileContents({
    owner: owner,
    repo: repo,
    path: filename,
    sha: existing?.data?.sha || undefined,
    message: `📦 admin/repo/content ${filename}`,
    content: Buffer.from(content).toString('base64'),
  });

  assistant.log('uploadContent(): Result', result);

  return result;
}
