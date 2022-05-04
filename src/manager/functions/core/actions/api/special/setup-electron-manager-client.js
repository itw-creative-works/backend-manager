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

    const uid = payload.data.payload.uid;
    const app = payload.data.payload.appId || payload.data.payload.app || Manager.config.app.id;

    let uuid = null;
    let error;

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

    // Fetch app details
    await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/getApp', {
      method: 'post',
      timeout: 30000,
      tries: 3,
      json: true,
      body: {
        id: app,
      },
    })
    .then(result => {
      return resolve({
        data: {
          uuid: uuid,
          timestamp: new Date().toISOString(),
          ip: assistant.request.ip,
          country: assistant.request.country,
          app: result,
        }
      });
    })
    .catch(e => {
      return reject(new Error(`Error fetching app details: ${e}`))
    })

  });

};


module.exports = Module;
