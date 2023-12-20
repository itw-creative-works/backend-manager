const fetch = require('node-fetch');
const wonderfulFetch = require('wonderful-fetch');
const Poster = require('ultimate-jekyll-poster');
const pathApi = require('path');
const { get } = require('lodash');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    // Perform checks
    if (!payload.user.roles.admin && !payload.user.roles.blogger) {
      return reject(assistant.errorify(`Admin required.`, {code: 401, sentry: false, send: false, log: false}).error)
    }

    const repoInfo = assistant.parseRepo(get(self.Manager.config, 'github.repo_website'));

    const poster = new Poster();

    // Save to disk OR commit
    poster.onDownload = function (meta) {
      return new Promise(async function(resolve, reject) {
        const tempPath = (meta.tempPath);
        const finalPath = poster.removeDirDot(meta.finalPath);

        poster.readImage(tempPath)
          .then(image => {
            createFile(get(self.Manager.config, 'github.user'), repoInfo.user, repoInfo.name, get(self.Manager.config, 'github.key'), finalPath, image)
              .then(() => {resolve()})
              .catch((e) => {reject(e)})
          })
          .catch((e) => {reject(e)})

      });
    }

    const finalPost = await poster.create(payload.data).catch(e => e);

    if (finalPost instanceof Error) {
      return reject(assistant.errorify(`Failed to post: ${finalPost}`, {code: 500, sentry: false, send: false, log: false}).error)
    }

    // Request indexing
    try {
      const url = get(self.Manager.config, 'brand.url');
      const encoded = encodeURIComponent(`${url}/sitemap.xml`);

      wonderfulFetch(`https://www.google.com/ping?sitemap=${encoded}`)

      // TODO
      // https://developers.google.com/search/apis/indexing-api/v3/prereqs
      // https://developers.google.com/search/apis/indexing-api/v3/using-api#url
    } catch (e) {
      assistant.error(`Failed to ping google: ${e}`);
    }

    // Save post OR commit
    await createFile(get(self.Manager.config, 'github.user'), repoInfo.user, repoInfo.name, get(self.Manager.config, 'github.key'), poster.removeDirDot(finalPost.path), finalPost.content)
    .then(() => {
      return resolve({data: finalPost});
    })
    .catch((e) => {
      return reject(assistant.errorify(`Failed to post: ${e}`, {code: 500, sentry: false, send: false, log: false}).error)
    })

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
