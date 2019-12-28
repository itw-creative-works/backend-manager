let Module = {
  init: async function (data) {
    this.ref = data.ref;
    this.req = data.req;
    this.res = data.res
    this.assistant = new this.ref.Assistant().init({
      ref: {
        req: data.req,
        res: data.res,
        admin: data.ref.admin,
        functions: data.ref.functions,
      },
    })
    return this;
  },
  main: async function() {
    let req = this.req;
    let res = this.res;
    let ref = this.ref;
    let assistant = this.assistant;
    return ref.cors(req, res, async () => {
      assistant.log(assistant.request);
      return res.status(200).json({status: 200, request: assistant.request.data});
    });
  }
}

module.exports = Module;
