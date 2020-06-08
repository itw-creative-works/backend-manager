let fetch;
let Poster;
let pathApi;
let os;
let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.req = data.req;
    this.res = data.res
    this.assistant = Manager.getNewAssistant({req: data.req, res: data.res});

    return this;
  },
  main: async function() {
    let self = this;
    let req = self.req;
    let res = self.res;
    let libraries = self.libraries;
    let assistant = self.assistant;

    return libraries.cors(req, res, async () => {
      let response = {
        status: 200,
      };

      // authenticate admin!
      let user = await assistant.authenticate();
      let repoInfo = assistant.parseRepo(self.Manager.config.github.repo_website);
      if (!user.roles.admin) {
        response.status = 500;
        response.error = new Error('Unauthenticated, admin required.');
        assistant.error(response.error, {environment: 'production'})
      } else {
        // Poster = Poster || require('/Users/ianwiedenman/Documents/GitHub/ITW-Creative-Works/ultimate-jekyll-poster');
        Poster = Poster || require('ultimate-jekyll-poster');

        let poster = new Poster();

        // Save to disk OR commit
        poster.onDownload = async function (meta) {
          return new Promise(async function(resolve, reject) {
            let finalPath = poster.removeDirDot(meta.finalPath);
            let tempPath = (meta.tempPath);
            await createFile(self.Manager.config.github.user, repoInfo.user, repoInfo.name, self.Manager.config.github.key, finalPath, await poster.readImage(tempPath))
            .catch((e) => {
              // console.log('---CAUGHT 1', e);
            })
            resolve();
          });
        }

        let finalPost = await poster.create(assistant.request.data);

        // Save post OR commit
        await createFile(self.Manager.config.github.user, repoInfo.user, repoInfo.name, self.Manager.config.github.key, poster.removeDirDot(finalPost.path), finalPost.content)
        .catch((e) => {
          response.status = 500;
          response.error = new Error('Failed to post: ' + e);
          assistant.error(response.error, {environment: 'production'})
        })
      }

      // assistant.log(assistant.request.data, response);

      if (response.status === 200) {
        return res.status(response.status).json(response.data);
      } else {
        return res.status(response.status).send(response.error.message);
      }
    });
  }
}
module.exports = Module;

// HELPERS //
async function createFile(user, repoUser, repoName, key, path, contents) {
  pathApi = pathApi || require('path');
  let fileParsed = pathApi.parse(path);

  let base64Data = Buffer.from(contents).toString('base64');
  // base64Data = contents;
  // console.log('--------base64Data', base64Data);
  return new Promise(async (resolve, reject) => {
    let sha;
    try {

      // let pathGet = `https://api.github.com/repos/iwiedenm/ultimate-jekyll/git/trees/template:${encodeURIComponent(path_noExt)}`;
      let branch = (repoName == 'ultimate-jekyll') ? 'template' : 'master';

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
          return element.path == fileParsed.base;
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
    fetch = fetch || require('node-fetch');
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


// function makeRequest(options) {
//   return new Promise(function(resolve, reject) {
//     request = request || require('request');
//     request(options,
//       function (err, httpResponse, body) {
//         if (err) {
//           // console.log('ERROR', err);
//           reject(err);
//         } else {
//           // console.log('SUCCESS', body);
//           resolve(body);
//         }
//       }
//     );
//   });
// }
