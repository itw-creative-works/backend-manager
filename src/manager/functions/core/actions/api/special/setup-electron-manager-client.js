function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    const fetch = Manager.require('wonderful-fetch');
    const _ = Manager.require('lodash');

    let uid = payload.data.payload.uid;
    const app = payload.data.payload.appId || payload.data.payload.app || Manager.config.app.id;
    let config = payload.data.payload.config || {};

    let uuid = null;
    let error;

    let signInToken = null;

    if (payload.data.authenticationToken || payload.data.backendManagerKey) {
      await self.Api.resolveUser({adminRequired: true})
      .then(async (user) => {
        uid = _.get(user, 'auth.uid', null);
        await self.libraries.admin.auth().createCustomToken(uid)
        .then(token => {
          signInToken = token;
        })
        .catch(e => {
          error = assistant.errorManager(`Failed to create custom token: ${e}`, {code: 500, sentry: false, send: false, log: false}).error
        })
      })
      .catch(e => {
        assistant.errorManager(`Failed to resolve user: ${e}`, {code: 500, sentry: false, send: false, log: true})
      })

      if (error) {
        return reject(error)
      }
    }

    // Generate uuid
    if (uid) {
      await Api.import('general:generate-uuid', {version: 5, name: uid})
      .then(library => {

        library.main()
        .then(result => {
          uuid = result.data.uuid;
        })
        .catch(e => {
          error = e;
        })
      })
    }

    if (error) {
      return reject(error)
    }

    if (config.backendManagerKey === Manager.config.backend_manager.key && Manager.config.backend_manager.key) {
      assistant.log('Validated config', config, {environment: 'production'})
    } else {
      config = {};
    }

    // Fetch app details
    await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/getApp', {
      method: 'post',
      timeout: 30000,
      tries: 3,
      response: 'json',
      body: {
        id: app,
      },
    })
    .then(result => {
      return resolve({
        data: {
          uuid: uuid,
          signInToken: signInToken,
          timestamp: new Date().toISOString(),
          ip: assistant.request.geolocation.ip,
          country: assistant.request.geolocation.country,
          app: result,
          config: config,
        }
      });
    })
    .catch(e => {
      return reject(assistant.errorManager(`Error fetching app details: ${e}`, {code: 500, sentry: false, send: false, log: false}).error)
    })




  });

};


module.exports = Module;
