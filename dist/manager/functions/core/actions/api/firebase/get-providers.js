const fetch = require('wonderful-fetch');
const { merge } = require('lodash');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const defaultProviders = {
      ['password']: {
        enabled: true,
      },
      ['google.com']: {
        enabled: true,
      },
      ['facebook.com']: {
        enabled: false,
      },
      ['twitter.com']: {
        enabled: false,
      },
      ['github.com']: {
        enabled: false,
      },
      ['microsoft.com']: {
        enabled: false,
      },
      ['yahoo.com']: {
        enabled: false,
      },
      ['apple.com']: {
        enabled: false,
      },
    }

    // Get app
    const appObject = await self.getAppObject();
    if (appObject instanceof Error) {
      return reject(assistant.errorify(`Failed to get app object: ${appObject}`, {code: 500}));
    }

    // Merge the default providers with the app providers
    const providers = merge(defaultProviders, appObject.authentication);

    // Reformat the object so it's just provider=true/false
    const finalProviders = {};
    Object.keys(providers).forEach(key => {
      finalProviders[key] = providers[key].enabled;
    });

    // Log
    assistant.log('Providers', finalProviders);

    // Resolve
    return resolve({data: finalProviders});
  });

};

// Get app object
Module.prototype.getAppObject = function () {
  const self = this;

  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const id = Manager.config.app.id;

    // Get the app settings
    fetch(`https://us-central1-itw-creative-works.cloudfunctions.net/getApp`, {
      method: 'post',
      response: 'json',
      body: {
        id: id,
      }
    })
    .then((r) => {
      assistant.log('getAppObject(): Response', r);

      // If data is missing, return an error
      if (!r) {
        throw new Error(`App with id ${id} not found`);
      }

      // Return the app object
      return resolve(r);
    })
    .catch(e => reject(e));
  });
};

module.exports = Module;
