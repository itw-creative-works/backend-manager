const uuid = require('uuid');

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

    // Analytics
    let analytics = self.Manager.Analytics({
      uuid: user.auth.uid,
    })
    .event({
      category: 'admin',
      action: 'generate-uuid',
      // label: '',
    });

    return libraries.cors(req, res, async () => {
      const namespace = assistant.request.data.namespace || self.Manager.config.backend_manager.namespace;
      assistant.request.data.version = `${assistant.request.data.version || '5'}`.replace('v', '');
      assistant.request.data.name = assistant.request.data.name || assistant.request.data.input;

      if (!assistant.request.data.name) {
        response.status = 400;
        response.error = new Error('You must provide a name to hash');
      } else if (assistant.request.data.version === '5') {
        response.data.uuid = uuid.v5(assistant.request.data.name, namespace);
      } else if (assistant.request.data.version === '4') {
        response.data.uuid = uuid.v4();
      }

      assistant.log(assistant.request.data, response);

      if (response.status === 200) {
        return res.status(response.status).json(response.data);
      } else {
        return res.status(response.status).send(response.error.message);
      }
    });
  },
}
module.exports = Module;
