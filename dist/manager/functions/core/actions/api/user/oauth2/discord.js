const decode = require('jwt-decode')
const _ = require('lodash')
const fetch = require('wonderful-fetch')

function OAuth2() {
  const self = this;
  self.provider = 'discord';
  self.name = 'Discord';
  self.urls = {
    // var oauthURL = 'https://discord.com/api/oauth2/authorize?client_id=701375931918581810&redirect_uri=URL&response_type=code&scope=identify';

    authorize: 'https://discord.com/api/oauth2/authorize',
    tokenize: 'https://discord.com/api/oauth2/token',
    refresh: 'https://discord.com/api/oauth2/token',
    status: '',
    removeAccess: 'https://discord.com/channels/@me',
  }
}

OAuth2.prototype.buildUrl = function (state, url) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  return new Promise(async function(resolve, reject) {
    if (state === 'authorize') {
      // do something with url
      return resolve()
    } else {
      return resolve()
    }
  });
};

OAuth2.prototype.verifyIdentity = function (tokenizeResult) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  return new Promise(async function(resolve, reject) {

    const identityResponse = await fetch('https://discord.com/api/users/@me', {
      timeout: 60000,
      response: 'json',
      tries: 1,
      log: true,
      cacheBreaker: false,
      headers: {
        authorization: `${tokenizeResult.token_type} ${tokenizeResult.access_token}`,
      },
    })
    .then(json => json)
    .catch(e => e)

    assistant.log('identityResponse', identityResponse);

    if (identityResponse instanceof Error) {
      return reject(identityResponse);
    }

    // Check if exists
    Manager.libraries.admin.firestore().collection(`users`)
    .where(`oauth2.${self.provider}.identity.id`, '==', identityResponse.id)
    .get()
    .then(async (snap) => {
      if (snap.size === 0) {
        return resolve(identityResponse);
      } else {
        return reject(new Error(`This ${self.name} account is already connected to a ${Manager.config.brand.name} account`));
      }
    })
    .catch((e) => {
      return reject(e);
    });

  });
};

// OAuth2.prototype.verifyConnection = function (newUrl, token) {
//   const self = this;
//   const Manager = self.Manager;
//   const assistant = self.assistant;
//
//   return new Promise(async function(resolve, reject) {
//
//     fetch(newUrl, {
//       method: 'post',
//       timeout: 60000,
//       response: 'json',
//       tries: 1,
//       log: true,
//       cacheBreaker: false,
//       body: {
//         id_token: token,
//       }
//     })
//     .then(json => {
//       // console.log('---json', json);
//       return resolve('connected');
//     })
//     .catch(e => {
//       try {
//         const parsed = JSON.parse(e.message);
//         return reject(new Error(`${parsed.error}: ${parsed.error_description}`))
//       } catch (e2) {
//         return reject(e);
//       }
//     })
//
//   });
// };


module.exports = OAuth2;
