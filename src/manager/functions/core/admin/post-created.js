let fetch;
let Poster;
let pathApi;
let os;
let JSON5;
let Module = {
  init: async function (Manager, data) {
    const self = this;
    self.Manager = Manager;
    self.libraries = Manager.libraries;

    // This needs to be uniquely processed because IFTTT FUCKIN SUCKS
    JSON5 = Manager.require('json5');
    try {
      data.req.body = JSON5.parse(decodeURIComponent(data.req.body.content));
    } catch (e) {
      assistant.error('Failed to JSON5.parse() and decodeURIComponent() the body.', e, {environment: 'production'})
    }

    self.assistant = Manager.Assistant({req: data.req, res: data.res});
    self.req = data.req;
    self.res = data.res;

    // console.log('self.assistant.request.data 111', self.assistant.request.data);
    // const keys = Object.keys(self.assistant.request.data);
    // keys.forEach((key, i) => {
    //   self.assistant.request.data[key] = decodeURIComponent(self.assistant.request.data[key]);
    // });
    // console.log('self.assistant.request.data 222', self.assistant.request.data);

    return self;
  },
  main: async function() {
    let self = this;
    let libraries = self.libraries;
    let assistant = self.assistant;
    let req = self.req;
    let res = self.res;

    let response = {
      status: 200,
    };

    // authenticate admin!
    let user = await assistant.authenticate();

    // Analytics
    let analytics = self.Manager.Analytics({
      uuid: user.auth.uid,
    })
    .event({
      category: 'admin',
      action: 'post-created',
      // label: '',
    });

    return libraries.cors(req, res, async () => {

      if (!user.roles.admin) {
        response.status = 401;
        response.error = new Error('Unauthenticated, admin required.');
        assistant.error(response.error, {environment: 'production'})
      } else {
        // HERE
        assistant.log('//TODO', {environment: 'production'});
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
function addToMCList(key, listId, email) {
  return new Promise((resolve, reject) => {
    let datacenter = key.split('-')[1];
    fetch = fetch || require('node-fetch');
    fetch(`https://${datacenter}.api.mailchimp.com/3.0/lists/${listId}/members`, {
        method: 'post',
        body: JSON.stringify({
          email_address: email,
          status: 'subscribed',
        }),
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${key}`,
        },
      })
      .then(res => res.json())
      .then(json => {
        if (json.status !== 'subscribed') {
          return reject(new Error(json.status));
        }
        return resolve(json);
      })
      .catch(e => {
        return reject(e);
      })

  });
}
