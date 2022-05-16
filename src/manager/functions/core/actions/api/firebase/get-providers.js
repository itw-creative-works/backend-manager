const fetch = require('wonderful-fetch');

function Module() {

}

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {

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

    payload.data.payload.firebaseApiKey = payload.data.payload.firebaseApiKey || false;

    if (!payload.data.payload.firebaseApiKey) {
      return reject(assistant.errorManager(`The <firebaseApiKey> parameter is required.`, {code: 400, sentry: false, send: false, log: false}).error)
    }

    function request(provider) {
      return new Promise(function(resolve, reject) {
        let prefix = '';
        provider.prefix
        .forEach((item, i) => {
          prefix += `${item}=LOL&`
        });

        fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${payload.data.payload.firebaseApiKey}`, {
          method: 'post',
          json: true,
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
            });

            assistant.log('Provider details', provider.name, result);

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

    assistant.log('Checking providers...', {environment: 'production'});

    await Promise.all(promises)
    .then(response => {
      // console.log('--payload.response.data', promises.length, payload.response.data);
      return resolve({data: payload.response.data});
    })
    .catch(e => {
      return reject(assistant.errorManager(`Failed to check providers: ${e}`, {code: 500, sentry: false, send: false, log: false}).error)
    })

  });

};


module.exports = Module;
