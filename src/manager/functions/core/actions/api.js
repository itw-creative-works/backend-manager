let fetch;
const _ = require('lodash');

let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.assistant = Manager.Assistant({req: data.req, res: data.res})
    this.req = data.req;
    this.res = data.res;

    return this;
  },
  main: async function() {
    let self = this;
    let libraries = self.libraries;
    let assistant = self.assistant;
    let req = self.req;
    let res = self.res;

    let response = {
      status: 200,
      data: {},
    };

    let user = await assistant.authenticate();

    return libraries.cors(req, res, async () => {
      const command = assistant.request.data.command;
      const payload = {
        response: response,
        data: assistant.request.data,
        user: user,
      }
      if (command === 'create-custom-token') {
        await self.createCustomToken(payload).catch(e => e);
      } else {
        response.status = 401;
        response.error = new Error(`Improper command supplied: ${command}`);
      }

      self.assistant.log('Api', payload, {environment: 'production'})

      if (response.status === 200) {
        return res.status(response.status).json(response.data);
      } else {
        return res.status(response.status).send(response.error.message);
      }
    });
  },
  createCustomToken: async function (payload) {
    const self = this;

    return new Promise(async function(resolve, reject) {
      if (payload.user.authenticated) {
        await self.libraries.admin.auth().createCustomToken(payload.user.auth.uid)
        .then(token => {
          payload.response.data.token = token;
          return resolve(payload);
        })
        .catch(e => {
          payload.response.status = 401;
          payload.response.error = new Error(`Failed to create custom token: ${e}`);
          return reject(payload.response.error);
        })
      } else {
        payload.response.status = 401;
        payload.response.error = new Error('User not authenticated.');
        return reject(payload.response.error);
      }

    });
  },
}
module.exports = Module;
