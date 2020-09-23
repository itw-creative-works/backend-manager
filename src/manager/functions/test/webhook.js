let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.req = data.req;
    this.res = data.res
    this.assistant = Manager.Assistant({req: data.req, res: data.res});

    return this;
  },
  main: async function() {
    let self = this;
    let req = self.req;
    let res = self.res;
    let libraries = self.libraries;
    let assistant = self.assistant;

    let user = await assistant.authenticate();

    // Analytics
    let analytics = self.Manager.Analytics({
      uuid: user.auth.uid,
    });

    analytics.event({
      category: 'admin',
      action: 'webhook-test',
      // label: '',
    });

    return libraries.cors(req, res, async () => {
      assistant.log(assistant.request);
      return res.status(200).json({status: 200, request: assistant.request.data});
    });
  }
}

module.exports = Module;
