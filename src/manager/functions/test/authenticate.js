let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.req = data.req;
    this.res = data.res
    this.assistant = Manager.Assistant({req: data.req, res: data.res}, {accept: 'json'});

    return this;
  },
  main: async function() {
    let self = this;
    let req = self.req;
    let res = self.res;
    let libraries = self.libraries;
    let assistant = self.assistant;
    
    return libraries.cors(req, res, async () => {
      assistant.log('Request:', assistant.request.data);
      let user = await assistant.authenticate();
      assistant.log('Result user:', user);
      return res.status(200).json({status: 200, user: user });
    });
  }
}

module.exports = Module;
