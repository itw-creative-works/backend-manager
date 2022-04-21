const uuid = require('uuid');

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

    let result = '';
    payload.data.payload.namespace = payload.data.payload.namespace || Manager.config.backend_manager.namespace;
    payload.data.payload.version = `${payload.data.payload.version || '5'}`.replace('v', '');
    payload.data.payload.name = payload.data.payload.name || payload.data.payload.input;

    if (payload.data.payload.version === '5') {
      if (!payload.data.payload.name) {
        return reject(assistant.errorManager(`You must provide a name to hash for uuid v5.`, {code: 400, sentry: false, send: false, log: false}).error)
      } else {
        result = uuid.v5(payload.data.payload.name, payload.data.payload.namespace);
      }
    } else if (payload.data.payload.version === '4') {
      result = uuid.v4();
    }

    assistant.log('UUID Generated', payload.data.payload, result, {environment: 'production'});

    return resolve({data: {uuid: result}});

  });

};


module.exports = Module;
