const { Octokit } = require('@octokit/rest');
const { parse } = require('yaml');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Check for GitHub configuration
    if (!process.env.GITHUB_TOKEN) {
      return reject(assistant.errorify(`GitHub API key not configured.`, {code: 500}));
    }

    if (!Manager.config?.github?.repo_website) {
      return reject(assistant.errorify(`GitHub repo_website not configured.`, {code: 500}));
    }

    // Setup Octokit
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });

    // Setup options
    payload.data.payload.url = payload.data.payload.url || '';

    // Check for required parameters
    if (!payload.data.payload.url) {
      return reject(assistant.errorify(`Missing required parameter: url`, {code: 400}));
    }

    let url;
    try {
      url = new URL(payload.data.payload.url);
    } catch (e) {
      return reject(assistant.errorify(`Invalid URL`, {code: 400}));
    }

    // Get the post
    const filename = url.pathname.replace(/blog|\//ig, '')
    const repoInfo = assistant.parseRepo(self?.Manager?.config?.github?.repo_website);
    const query = `title+repo:${repoInfo.user}/${repoInfo.name}+filename:${filename}`;

    assistant.log('Running search', query, repoInfo);

    // Using octokit, search the repo for the file matching the url
    // https://stackoverflow.com/questions/25564760/how-can-i-search-file-name-in-specific-github-repository
    // https://docs.github.com/en/search-github/searching-on-github/searching-code#search-by-filename
    const results = await octokit.rest.search.code({
      q: query,
    }).catch(e => e);

    // Log
    assistant.log('Results', results);

    // Check for errors
    if (results instanceof Error) {
      return reject(assistant.errorify(`Error searching for post: ${results}`, {code: 500}));
    } else if (results?.data?.total_count === 0) {
      return reject(assistant.errorify(`Post not found`, {code: 404}));
    }

    // Get the first results
    const firstResult = results.data.items[0];

    // Fetch the content of the post
    const post = await octokit.rest.repos.getContent({
      owner: repoInfo.user,
      repo: repoInfo.name,
      path: firstResult.path,
    }).catch(e => e);


    // Log
    assistant.log('Post', post);

    // Check for errors
    if (post instanceof Error) {
      return reject(assistant.errorify(`Error fetching post: ${post}`, {code: 500}));
    }

    // Decode the content
    const fullContent = Buffer.from(post.data.content, 'base64').toString();
    const splitContent = fullContent.split('---');
    const frontmatter = splitContent[1].trim();
    const body = splitContent.slice(2).join('---').trim();
    const parsed = parse(frontmatter);

    // Return
    return resolve({
      data: {
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
      }
    });
  });

};

module.exports = Module;
