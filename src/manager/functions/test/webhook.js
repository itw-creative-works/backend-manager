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
    let req = this.req;
    let res = this.res;
    let libraries = this.libraries;
    let assistant = this.assistant;
    return libraries.cors(req, res, async () => {
      assistant.log(assistant.request);
      return res.status(200).json({status: 200, request: assistant.request.data});
    });
  }
}

module.exports = Module;
