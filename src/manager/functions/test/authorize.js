let Module = {
  init: async function (Manager, data) {
    this.Manager = Manager;
    this.libraries = Manager.libraries;
    this.req = data.req;
    this.res = data.res
    this.assistant = Manager.getNewAssistant(data.req, data.res, {accept: 'json'})

    return this;
  },
  main: async function() {
    let req = this.req;
    let res = this.res;
    let libraries = this.libraries;
    let assistant = this.assistant;
    return libraries.cors(req, res, async () => {
      assistant.log('Request:', assistant.request.data);
      let user = await assistant.authorize();
      assistant.log('Result user:', user);
      return res.status(200).json({status: 200, user: user });
    });
  }
}

module.exports = Module;
