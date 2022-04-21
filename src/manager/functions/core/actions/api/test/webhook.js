function Module() {

}

Module.prototype.init = async function (s, payload) {
  const self = this;
  self.Api = s;
  self.Manager = s.Manager;
  self.libraries = s.Manager.libraries;
  self.assistant = s.Manager.assistant;
  self.payload = payload;

  return self;
};

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {


    if (payload.data.payload.status >= 200 && payload.data.payload.status <= 299) {
      return resolve({data: payload.data.payload.response, status: payload.data.payload.status});
    } else if (payload.data.payload.status >= 400 && payload.data.payload.status <= 599) {
      return reject(assistant.errorManager(payload.data.payload.response || 'Unknown error message provided', {code: payload.data.payload.status, sentry: false, send: false, log: false}).error)
    }

  });

};


module.exports = Module;
