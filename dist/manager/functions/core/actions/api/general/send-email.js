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
      payload: {
        backendManagerKey: Manager.config.backend_manager.key,
        app: Manager.config.app.id,
      },
    }

    if (!payload.data.payload.id) {
      return reject(assistant.errorify(`Parameter {id} is required.`, {code: 400}));
    } else if (!payload.data.payload.email) {
      return reject(assistant.errorify(`Parameter {email} is required.`, {code: 400}));
    }

    let emailPayload
    try {
      const script = require(path.join(__dirname, 'emails', `${payload.data.payload.id}.js`))
      emailPayload = merge(
        {},
        DEFAULT,
        script(payload.data.payload, Manager.config),
      );
    } catch (e) {
      return reject(assistant.errorify(`${payload.data.payload.id} is not a valid email ID.`, {code: 400}));
    }

    const storage = Manager.storage({temporary: true});
    const ipPath = ['api:general:send-email', 'ips', assistant.request.geolocation.ip];
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

    assistant.log('Storage:', storage.getState()['api:general:send-email']);

    if (ipData.count >= emailPayload.spamFilter.ip || emailData.count >= emailPayload.spamFilter.email) {
      self.assistant.errorify(`Spam filter triggered ip=${ipData.count}, email=${emailData.count}`, {code: 429, log: true});

      return resolve({data: {success: true}});
    }

    if (emailPayload.delay) {
      // emailPayload.payload.sendAt = new Date(new Date().getTime() + (emailPayload.delay * 1000)).toISOString();
      emailPayload.payload.sendAt = Math.round((new Date().getTime() + emailPayload.delay) / 1000);
    }

    // Log the email payload
    assistant.log('Email payload:', emailPayload);

    // Send the email
    await fetch(`https://us-central1-itw-creative-works.cloudfunctions.net/sendEmail`, {
      method: 'post',
      response: 'json',
      log: true,
      body: emailPayload.payload,
    })
    .then(async (json) => {
      assistant.log('Response:', json);

      return resolve({
        data: {
          success: true,
        }
      });
    })
    .catch(e => {
      return reject(assistant.errorify(`Error sending email: ${e}`, {code: 500, sentry: true}));
    });

  });

};


module.exports = Module;

