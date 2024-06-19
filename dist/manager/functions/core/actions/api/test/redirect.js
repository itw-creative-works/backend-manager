const uuid = require('uuid');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    payload.data.payload.url = payload.data.payload.url || 'https://itwcreativeworks.com'

    assistant.log('Redirecting', payload.data.payload.url);

    return resolve({redirect: payload.data.payload.url});
  });

};


module.exports = Module;
