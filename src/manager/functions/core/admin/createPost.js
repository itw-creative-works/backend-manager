let request;
let Poster;
let pathApi;
let os;
let Module = {
  init: async function (data) {
    this.ref = data.ref;
    this.req = data.req;
    this.res = data.res
    this.assistant = new this.ref.BackendAssistant().init({
      ref: {
        req: data.req,
        res: data.res,
        admin: data.ref.admin,
        functions: data.ref.functions,
      }
    })
    return this;
  },
  main: async function() {
    let req = this.req;
    let res = this.res;
    let ref = this.ref;
    let assistant = this.assistant;
    let This = this;

    return ref.cors(req, res, async () => {
      let response = {
        status: 200,
      };

      // TODO: authenticate admin!
      let authAdmin = await assistant.authorizeAdmin();
      let repoInfo = assistant.parseRepo(This.ref.functions.config().github.repo_website);
      if (!authAdmin) {
        response.status = 500;
        response.error = 'Unauthenticated, admin required.';
        assistant.log(response);
        return res.status(response.status).json(response);
      } else {
        // Poster = Poster || require('/Users/ianwiedenman/Documents/GitHub/ITW-Creative-Works/ultimate-jekyll-poster');
        Poster = Poster || require('ultimate-jekyll-poster');

        let poster = new Poster();

        // Save to disk OR commit
        poster.onDownload = async function (meta) {
          return new Promise(async function(resolve, reject) {
            let finalPath = poster.removeDirDot(meta.finalPath);
            let tempPath = (meta.tempPath);
            await createFile(This.ref.functions.config().github.user, repoInfo.user, repoInfo.name, This.ref.functions.config().github.key, finalPath, await poster.readImage(tempPath));
            resolve();
          });
        }

        let finalPost = await poster.create(assistant.request.data);

        // Save post OR commit
        await createFile(This.ref.functions.config().github.user, repoInfo.user, repoInfo.name, This.ref.functions.config().github.key, poster.removeDirDot(finalPost.path), finalPost.content);
      }

      assistant.log(assistant.request.data, response);
      // return 'break';
      return res.status(response.status).json(response);
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
      let pathGet = `https://api.github.com/repos/${repoUser}/${repoName}/git/trees/template:${encodeURIComponent(pathApi.dirname(path))}`;
      console.log('-------GET', pathGet);
      await makeRequest({
        // url: `https://api.github.com/repos/:owner/:repo/contents/:path`,
        method: 'GET',
        // url: `https://api.github.com/repos/iwiedenm/ultimate-jekyll/contents/api-test/text.txt`,
        url: pathGet,
        body: {
        },
        timeout: 30000,
        json: true,
        auth: {
          user: user,
          pass: key
        },
        headers: {
          'User-Agent': user
        }
      })
      .then(function (resp) {
        // sha = resp.sha;
        sha = resp.tree.find(function (element) {
          console.log('checiing', element.path, fileParsed.base);
          return element.path == fileParsed.base;
        });
        sha = sha.sha;
      });
  } catch (e) {
    console.log('ERROR', e);
    sha = null;
  }

  let pathPut = `https://api.github.com/repos/${repoUser}/${repoName}/contents/${path}`;
  let writeRequest =
  {
    // url: `https://api.github.com/repos/:owner/:repo/contents/:path`,
    method: 'PUT',
    url: pathPut,
    body: {
      message: "NEW POST",
      content: base64Data,
    },
    timeout: 30000,
    json: true,
    auth: {
      user: user,
      pass: key
    },
    headers: {
      'User-Agent': user
    }
  }
  if (sha) {
    writeRequest.body.sha = sha;
  }
  console.log('--------PUT', pathPut);
  await makeRequest(writeRequest);
  resolve(true)
  });
}



function makeRequest(options) {
  return new Promise(function(resolve, reject) {
    request = request || require('request');
    request(options,
      function (err, httpResponse, body) {
        if (err) {
          // console.log('ERROR', err);
          reject(err);
        } else {
          // console.log('SUCCESS', body);
          resolve(body);
        }
      }
    );
  });
}
