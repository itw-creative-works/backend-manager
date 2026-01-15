/**
 * GET /firebase/providers - Get authentication providers
 * Returns enabled auth providers for the app
 */
const { merge } = require('lodash');

module.exports = async (assistant) => {
  const Manager = assistant.Manager;
  const fetch = Manager.require('wonderful-fetch');

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
  };

  // Get app object
  const appObject = await getAppObject(Manager, assistant).catch(e => e);
  if (appObject instanceof Error) {
    return assistant.respond(`Failed to get app object: ${appObject}`, { code: 500 });
  }

  // Merge the default providers with the app providers
  const providers = merge(defaultProviders, appObject.authentication);

  // Reformat the object so it's just provider=true/false
  const finalProviders = {};
  Object.keys(providers).forEach(key => {
    finalProviders[key] = providers[key].enabled;
  });

  assistant.log('Providers', finalProviders);

  // Track analytics
  assistant.analytics.event('firebase/providers', { action: 'get' });

  return assistant.respond(finalProviders);
};

// Helper: Get app object from ITW
async function getAppObject(Manager, assistant) {
  const fetch = Manager.require('wonderful-fetch');
  const id = Manager.config.app.id;

  const result = await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/getApp', {
    method: 'post',
    response: 'json',
    body: {
      id: id,
    }
  });

  assistant.log('getAppObject(): Response', result);

  if (!result) {
    throw new Error(`App with id ${id} not found`);
  }

  return result;
}
