const path = require('path');
const fetch = require('wonderful-fetch');
const {get,set,merge} = require('lodash');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    payload.data.payload.id = payload.data.payload.id;
    payload.data.payload.email = payload.data.payload.email;
    payload.data.payload.name = payload.data.payload.name;

    const DEFAULT = {
      spamFilter: {
        ip: 3,
        email: 3,
      },
      delay: 1,
      body: {},
    }

    if (!payload.data.payload.id) {
      return reject(assistant.errorManager(`Parameter {id} is required.`, {code: 400, sentry: false, send: false, log: false}).error)
    } else if (!payload.data.payload.email) {
      return reject(assistant.errorManager(`Parameter {email} is required.`, {code: 400, sentry: false, send: false, log: false}).error)
    }

    let emailPayload 
    try {
      emailPayload = merge({}, DEFAULT, require(path.join(__dirname, 'emails', `${payload.data.payload.id}.js`))(payload.data.payload, Manager.config));
    } catch (e) {
      return reject(assistant.errorManager(`${payload.data.payload.id} is not a valid email ID.`, {code: 400, sentry: false, send: false, log: false}).error)
    }

    const storage = Manager.storage({temporary: true});
    const ipPath = ['api:general:send-email', 'ips', assistant.request.ip];
    const emailPath = ['api:general:send-email', 'emails', payload.data.payload.email];

    const ipData = storage.get(ipPath).value() || {};
    const emailData = storage.get(emailPath).value() || {};

    ipData.count = (ipData.count || 0) + 1;
    ipData.firstRequestTime = ipData.firstRequestTime ? ipData.firstRequestTime : new Date().toISOString();
    ipData.lastRequestTime = new Date().toISOString();

    emailData.count = (emailData.count || 0) + 1;
    emailData.firstRequestTime = emailData.firstRequestTime ? emailData.firstRequestTime : new Date().toISOString();
    emailData.lastRequestTime = new Date().toISOString();    

    storage.set(ipPath, ipData).write();
    storage.set(emailPath, emailData).write();

    assistant.log('Storage:', storage.getState()['api:general:send-email'], {environment: 'production'});

    if (ipData.count >= emailPayload.spamFilter.ip || emailData.count >= emailPayload.spamFilter.email) {
      self.assistant.errorManager(`Spam filter triggered ip=${ipData.count}, email=${emailData.count}`, {code: 429, sentry: false, send: false, log: true})
      return resolve({data: {success: true}});
    }    

    assistant.log('Email payload:', emailPayload, {environment: 'production'});

    const sendableBody = {
      backendManagerKey: Manager.config.backend_manager.key,
      service: 'sendgrid',
      command: `v3/mail/send`,
      method: 'post',
      delay: emailPayload.delay,
      body: emailPayload.body,
    }

    fetch('https://us-central1-itw-creative-works.cloudfunctions.net/wrapper', {
      method: 'post',
      timeout: 30000,
      tries: 1,
      response: 'json',
      body: sendableBody,
    })
    .then(res => {
      assistant.log('Response:', res, {environment: 'production'});

      return resolve({
        data: {
          success: true,
        }
      });
    })
    .catch(e => {
      return reject(assistant.errorManager(`Error sending email: ${e}`, {code: 500, sentry: true, send: false, log: false}).error)
    })    
  });

};


module.exports = Module;

