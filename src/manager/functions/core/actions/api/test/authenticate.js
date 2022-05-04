function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    assistant.log('User:', payload.user);

    return resolve({data: {user: payload.user}});
  });

};


module.exports = Module;
