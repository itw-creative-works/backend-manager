const fetch = require('wonderful-fetch');
const moment = require('moment');
const jetpack = require('fs-jetpack');
const powertools = require('node-powertools');
const uuidv4 = require('uuid').v4;
const { get, set } = require('lodash');
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
      if (!payload.data.payload.path) {
        return reject(assistant.errorify(`Missing required parameter: path`, {code: 400}));
      } else if (!payload.data.payload.content) {
        return reject(assistant.errorify(`Missing required parameter: content`, {code: 400}));
      }

      // Fix other values
      payload.data.payload.type = payload.data.payload.type || 'text';
      // payload.data.payload.overwrite = typeof payload.data.payload.overwrite === 'undefined' ? true : payload.data.payload.overwrite;
      payload.data.payload.githubUser = payload.data.payload.githubUser || bemRepo.user;
      payload.data.payload.githubRepo = payload.data.payload.githubRepo || bemRepo.name;

      // Log
      assistant.log(`main(): Creating file...`, payload.data.payload);

      // Upload post
      const uploadContent = await self.uploadContent();

      // Log
      assistant.log(`main(): uploadContent`, uploadContent);

      // Resolve
      return resolve({data: payload.data.payload});
    } catch (e) {
      return reject(e);
    }
  });
};

// Upload post to GitHub
Module.prototype.uploadContent = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Save variables
    const owner = payload.data.payload.githubUser;
    const repo = payload.data.payload.githubRepo;
    const filename = payload.data.payload.path;
    const content = payload.data.payload.content;

    // Log
    assistant.log(`uploadContent(): filename`, filename);

    // Get existing post
    const existing = await self.octokit.rest.repos.getContent({
      owner: owner,
      repo: repo,
      path: filename,
    })
    .catch((e) => e);

    // Log
    assistant.log(`uploadContent(): Existing`, existing);

    // Quit if error and it's DIFFERENT than 404
    if (
      existing instanceof Error
      && existing?.status !== 404
    ) {
      return reject(existing);
    }

    // Upload post
    await self.octokit.rest.repos.createOrUpdateFileContents({
      owner: owner,
      repo: repo,
      path: filename,
      sha: existing?.data?.sha || undefined,
      message: `📦 admin:write-repo-content ${filename}`,
      content: Buffer.from(content).toString('base64'),
    })
    .then((r) => {
      // Log
      assistant.log(`uploadContent(): Result`, r);

      // Resolve
      return resolve(r);
    })
    .catch((e) => reject(e));
  });
};

module.exports = Module;
