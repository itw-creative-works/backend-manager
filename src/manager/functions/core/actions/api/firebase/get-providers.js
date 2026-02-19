const { merge } = require('lodash');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

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

    // Merge the default providers with the config providers
    const providers = merge(defaultProviders, Manager.config.authentication || {});

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

module.exports = Module;
