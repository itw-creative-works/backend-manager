const fetch = require('wonderful-fetch');
const moment = require('moment');
const jetpack = require('fs-jetpack');
const powertools = require('node-powertools');
const uuidv4 = require('uuid').v4;
const path = require('path');
const { Octokit } = require('@octokit/rest');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    try {
      // Perform checks
      if (!payload.user.roles.admin && !payload.user.roles.blogger) {
        return reject(assistant.errorify(`Admin required.`, {code: 401}));
      }

      // Log payload
      assistant.log(`main(): payload.data`, payload.data);

      // Set now
      const now = assistant.meta.startTime.timestamp;
      const bemRepo = assistant.parseRepo(Manager?.config?.github?.repo_website);

      // Setup Octokit
      self.octokit = new Octokit({
        auth: Manager?.config?.github?.key,
      });

      // Check for required values
      if (!payload.data.payload.url) {
        return reject(assistant.errorify(`Missing required parameter: url`, {code: 400}));
      } else if (!payload.data.payload.body) {
        return reject(assistant.errorify(`Missing required parameter: body`, {code: 400}));
      }

      // Set defaults
      payload.data.payload.url = payload.data.payload.url
        // Replace blog/
        .replace(/blog\//ig, '')
        // Remove leading and trailing slashes
        .replace(/^\/|\/$/g, '')
        // Trim
        .trim();
      payload.data.payload.body = payload.data.payload.body
        .replace(powertools.regexify(`/# ${payload.data.payload.title}/i`), '')
        .replace(/\n\n\n+/g, '\n\n')
        .trim();

      // Fix even more values
      payload.data.payload.path = `_posts/${moment(now).format('YYYY')}/${payload.data.payload.path || 'guest'}`;
      payload.data.payload.githubUser = payload.data.payload.githubUser || bemRepo.user;
      payload.data.payload.githubRepo = payload.data.payload.githubRepo || bemRepo.name;

      // Log
      assistant.log(`main(): Editing post...`, payload.data.payload);

      // Upload post
      const fetchedPost = await self.fetchPost(payload.data.payload.url);

      // Upload post
      const uploadPost = await self.uploadPost(fetchedPost, payload.data.payload.body);

      // Log
      assistant.log(`main(): uploadPost`, uploadPost);

      // Resolve
      return resolve({data: payload.data.payload});
    } catch (e) {
      return reject(e);
    }
  });
};

// Fetch post
Module.prototype.fetchPost = function (url) {
  const self = this;

  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    fetch(`${Manager.project.functionsUrl}/bm_api`, {
      method: 'post',
      response: 'json',
      timeout: 190000,
      tries: 1,
      body: {
        command: 'general:fetch-post',
        payload: {
          url: url,
        },
      },
    })
    .then((r) => {
      assistant.log(`fetchPost(): Result`, r);

      return resolve(r);
    })
    .catch((e) => {
      assistant.log(`fetchPost(): Error`, e);

      return reject(e);
    });
  })
};

Module.prototype.uploadPost = function (fetchedPost, content) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const filename = fetchedPost.path;
    const sha = fetchedPost.sha;
    const frontmatter = fetchedPost.frontmatter;
    const owner = payload.data.payload.githubUser;
    const repo = payload.data.payload.githubRepo;

    // Combine content
    const fullContent = '---\n'
      + `${frontmatter}\n`
      + '---\n'
      + '\n'
      + content;

    // Upload post
    await self.octokit.rest.repos.createOrUpdateFileContents({
      owner: owner,
      repo: repo,
      path: filename,
      sha: sha,
      message: `📦 admin:edit-post:upload-post ${filename}`,
      content: Buffer.from(fullContent).toString('base64'),
    })
    .then((r) => {
      assistant.log(`uploadPost(): Result`, r);

      return resolve(r);
    })
    .catch((e) => reject(e));
  });
};

module.exports = Module;
