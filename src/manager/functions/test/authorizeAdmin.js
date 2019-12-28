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
      accept: 'json',
    })
    return this;
  },
  main: async function() {
    let req = this.req;
    let res = this.res;
    let ref = this.ref;
    let assistant = this.assistant;
    return ref.cors(req, res, async () => {
      assistant.log('Request:', assistant.request.data);
      await assistant.authorizeAdmin();
      assistant.log('Result isAdmin:', assistant.request.isAdmin);
      return res.status(200).json({status: 200, isAdmin: assistant.request.isAdmin });
    });
  }
}

module.exports = Module;
