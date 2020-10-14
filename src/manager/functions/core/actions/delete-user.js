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
