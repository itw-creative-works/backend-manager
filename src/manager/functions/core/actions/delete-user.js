let fetch;
const _ = require('lodash');

let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.req = data.req;
    this.res = data.res
    this.assistant = Manager.getNewAssistant({req: data.req, res: data.res})

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
        data: {},
      };

      let user = await assistant.authenticate();

      if (!user.authenticated) {
        response.status = 401;
        response.error = new Error('User not authenticated.');
      } else {
        await libraries.admin.auth().deleteUser(user.auth.uid)
          .then(function() {
            response.status = 200;
            response.data = {success: true};
          })
          .catch(function(e) {
            response.status = 500;
            response.error = e;
          });
      }

      // assistant.log(assistant.request.data, response);

      if (response.status === 200) {
        return res.status(response.status).json(response.data);
      } else {
        return res.status(response.status).send(response.error.message);
      }
    });
  },
}
module.exports = Module;
