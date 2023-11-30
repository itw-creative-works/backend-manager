const fetch = require('wonderful-fetch');
const _ = require('lodash');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

    // console.log('---self.libraries.admin', self.libraries.admin);
    // console.log('---self.libraries.admin.credential', self.libraries.admin.credential);
    // console.log('---self.libraries.admin.credential.cert()', self.libraries.admin.credential.cert());
    // console.log('---self.libraries.admin.credential.refreshToken()', self.libraries.admin.credential.refreshToken());
    // console.log('---self.libraries.admin.default', self.libraries.admin.default);
    // console.log('---self.libraries.initializedAdmin', self.libraries.initializedAdmin);
    // console.log('---self.libraries.admin.INTERNAL', self.libraries.admin.INTERNAL);
    // console.log('---self.libraries.initializedAdmin.options_.credential', self.libraries.initializedAdmin.options_.credential);
    // console.log('---self.libraries.initializedAdmin.options_.credential.refreshToken', self.libraries.initializedAdmin.options_.credential.refreshToken);
    // console.log('---self.libraries.initializedAdmin.options_.credential.refreshToken', self.libraries.initializedAdmin.options_.credential.refreshToken);
    // console.log('---self.libraries.initializedAdmin.INTERNAL', self.libraries.initializedAdmin.INTERNAL);
    // const powertools = require('node-powertools');
    // console.log('---self.libraries.admin', powertools.stringify(self.libraries.admin));
    // console.log('---self.libraries.initializedAdmin', powertools.stringify(self.libraries.initializedAdmin));

    const providers = [
      { name: 'google.com', prefix: ['id_token'] },
      { name: 'facebook.com', prefix: ['access_token'] },
      { name: 'twitter.com', prefix: ['access_token', 'oauth_token_secret'] },
      { name: 'github.com', prefix: ['access_token'] },
      { name: 'microsoft.com', prefix: ['id_token'] },
      // { name: 'microsoft.com', prefix: ['context', 'continueUri', 'sessionId'] },
      { name: 'yahoo.com', prefix: ['id_token'] },
      { name: 'apple.com', prefix: ['id_token'] },
    ]
    const promises = []

    payload.data.payload.firebaseApiKey = payload.data.payload.firebaseApiKey || _.get(Manager, 'config.firebaseConfig.apiKey') || false;

    if (!payload.data.payload.firebaseApiKey) {
      return reject(assistant.errorManager(`The firebaseApiKey parameter is required.`, {code: 400, sentry: false, send: false, log: false}).error)
    }

    // Default
    payload.response.data.password = true;

    assistant.log('Checking providers for firebaseApiKey', payload.data.payload.firebaseApiKey);

    function request(provider) {
      return new Promise(function(resolve, reject) {
        let prefix = '';
        provider.prefix
        .forEach((item, i) => {
          prefix += `${item}=LOL&`
        });

        // https://firebase.google.com/docs/reference/rest/auth#section-sign-in-with-oauth-credential
        fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${payload.data.payload.firebaseApiKey}`, {
          method: 'post',
          body: {
            postBody: `${prefix}providerId=${provider.name}`,
            requestUri: 'http://localhost',
            returnIdpCredential: true,
            returnSecureToken: true
          }
        })
        .then(response => {
          payload.response.data[provider.name] = true;
        })
        .catch(e => {
          try {
            const errorJson = JSON.parse(e.message);
            const errorArray = errorJson.error.errors || [];
            let result = true;

            errorArray
            .forEach((error, i) => {
              if (error.message.includes('OPERATION_NOT_ALLOWED') || error.message.includes('INVALID_CREDENTIAL_OR_PROVIDER_ID')) {
                result = false;
              }
              assistant.log('Provider check', provider.name, error);
            });

            assistant.log('Provider response', provider.name, result);

            payload.response.data[provider.name] = result;
          } catch (e) {
            assistant.errorManager(`Error parsing error: ${e}`, {sentry: true, send: false, log: true})
            payload.response.data[provider.name] = false;
          }
        })
        .finally(r => {
          return resolve();
        })
      });
    }

    providers
    .forEach((provider, i) => {
      payload.response.data[provider.name] = false;
      promises.push(request(provider))
    });

    assistant.log('Checking providers...');

    await Promise.all(promises)
    .then(response => {
      // console.log('--payload.response.data', promises.length, payload.response.data);

      fetch(`https://us-central1-itw-creative-works.cloudfunctions.net/getApp`, {
        method: 'post',
        response: 'json',
        body: {
          id: Manager.config.app.id,
        }
      })
      .then(response => {
        assistant.log('getApp response', response);
        response.authentication = response.authentication || {};

        Object.keys(response.authentication)
        .forEach((provider, i) => {
          response.authentication[provider] = response.authentication[provider] || {};

          if (typeof response.authentication[provider].enabled !== 'undefined') {
            payload.response.data[provider] = response.authentication[provider].enabled;
            assistant.log(`Overwriting ${provider} to ${payload.response.data[provider]}...`);
          }
        });

      })
      .catch(e => {
        assistant.errorManager(`Error getting app data: ${e}`, {sentry: false, send: false, log: true})
      })
      .finally(r => {
        return resolve({data: payload.response.data});
      })

    })
    .catch(e => {
      return reject(assistant.errorManager(`Failed to check providers: ${e}`, {code: 500, sentry: false, send: false, log: false}).error)
    })

  });

};

module.exports = Module;
