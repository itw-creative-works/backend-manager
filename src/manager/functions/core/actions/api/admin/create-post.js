const fetch = require('node-fetch');
const Poster = require('ultimate-jekyll-poster');
const pathApi =  require('path');
const { get } = require('lodash');

function Module() {

}

Module.prototype.init = async function (s, payload) {
  const self = this;
  self.Api = s;
  self.Manager = s.Manager;
  self.libraries = s.Manager.libraries;
  self.assistant = s.assistant;
  self.payload = payload;

  return self;
};

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    if (!payload.user.roles.admin) {
      return reject(assistant.errorManager(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    }

    const repoInfo = assistant.parseRepo(get(self.Manager.config, 'github.repo_website'));

    const poster = new Poster();

    // Save to disk OR commit
    poster.onDownload = async function (meta) {
      return new Promise(async function(resolve, reject) {
        let finalPath = poster.removeDirDot(meta.finalPath);
        let tempPath = (meta.tempPath);
        await createFile(get(self.Manager.config, 'github.user'), repoInfo.user, repoInfo.name, get(self.Manager.config, 'github.key'), finalPath, await poster.readImage(tempPath))
        .catch((e) => {
          // console.log('---CAUGHT 1', e);
        })
        resolve();
      });
    }

    const finalPost = await poster.create(payload.data);

    // Save post OR commit
    await createFile(get(self.Manager.config, 'github.user'), repoInfo.user, repoInfo.name, get(self.Manager.config, 'github.key'), poster.removeDirDot(finalPost.path), finalPost.content)
    .catch((e) => {
      return reject(assistant.errorManager(`Failed to post: ${e}`, {code: 500, sentry: false, send: false, log: false}).error)
    })

    return resolve({data: finalPost});
  });

};

// HELPERS //
async function createFile(user, repoUser, repoName, key, path, contents) {
  let fileParsed = pathApi.parse(path);

  let base64Data = Buffer.from(contents).toString('base64');
  // base64Data = contents;
  // console.log('--------base64Data', base64Data);
  return new Promise(async (resolve, reject) => {
    let sha;
    try {

      // let pathGet = `https://api.github.com/repos/iwiedenm/ultimate-jekyll/git/trees/template:${encodeURIComponent(path_noExt)}`;
      let branch = (repoName === 'ultimate-jekyll') ? 'template' : 'master';

      let pathGet = `https://api.github.com/repos/${repoUser}/${repoName}/git/trees/${branch}:${encodeURIComponent(pathApi.dirname(path))}`;
      await makeRequest({
        method: 'GET',
        url: pathGet,
        body: {
        },
        timeout: 30000,
        json: true,
        headers: {
          'User-Agent': user,
          // 'Authorization': `Basic ${user}:${key}`,
          'Authorization': `Basic ${Buffer.from(user + ':' + key).toString('base64')}`,
        }
      })
      .then(function (resp) {
        // sha = resp.sha;
        sha = resp.tree.find(function (element) {
          // console.log('checiing', element.path, fileParsed.base);
          return element.path === fileParsed.base;
        });
        sha = sha.sha;
      });
  } catch (e) {
    sha = null;
  }

  let pathPut = `https://api.github.com/repos/${repoUser}/${repoName}/contents/${path}`;
  let writeRequest =
  {
    // url: `https://api.github.com/repos/:owner/:repo/contents/:path`,
    method: 'PUT',
    url: pathPut,
    body: {
      message: `BackendManager Post: ${new Date().toISOString()}`,
      content: base64Data,
    },
    timeout: 30000,
    json: true,
    headers: {
      'User-Agent': user,
      // 'Authorization': `Basic ${user}:${key}`,
      'Authorization': `Basic ${Buffer.from(user + ':' + key).toString('base64')}`,
    }
  }
  if (sha) {
    writeRequest.body.sha = sha;
  }
  // console.log('--------PUT', pathPut);
  await makeRequest(writeRequest)
  .then((json) => {
    if (!json || (json.message && (json.message === 'Not Found' || json.message.includes('Invalid request'))) ) {
      return reject(new Error(json.message));
    }
  })
  .catch((e) => {
    return reject(e);
  })
  return resolve(true)
  });
}

function makeRequest(options) {
  return new Promise(function(resolve, reject) {
    options.headers = options.headers || {};
    options.headers['Content-Type'] = 'application/json';
    let hasBody = Object.keys(options.body || {}).length > 0
    fetch(options.url, {
        method: options.method,
        body: hasBody ? JSON.stringify(options.body) : undefined,
        timeout: 30000,
        headers: options.headers,
        auth: options.auth,
      })
      .then(res => res.json())
      .then(json => {
        return resolve(json);
      })
      .catch(e => {
        // console.error('e', e);
        return reject(e);
      })

  });
}

module.exports = Module;