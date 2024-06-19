const decode = require('jwt-decode')
const _ = require('lodash')
const fetch = require('wonderful-fetch')

function OAuth2() {
  const self = this;
  self.provider = 'google';
  self.name = 'Google';
  self.urls = {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenize: 'https://oauth2.googleapis.com/token',
    refresh: 'https://oauth2.googleapis.com/token',
    // status: 'https://oauth2.googleapis.com/tokeninfo?id_token={token}'
    status: 'https://oauth2.googleapis.com/tokeninfo',
    removeAccess: 'https://myaccount.google.com/security',
  }
}

OAuth2.prototype.buildUrl = function (state, url) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  return new Promise(async function(resolve, reject) {
    if (state === 'authorize') {
      // do something with url
      // url.searchParams.set('prompt', typeof payload.data.payload.prompt === 'undefined' ? 'consent' : payload.data.payload.prompt)
      // url.searchParams.set('prompt', 'consent')
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
    const decoded = decode(tokenizeResult.id_token);

    // console.log('---decoded', decoded);

    // Check if exists
    Manager.libraries.admin.firestore().collection(`users`)
    .where(`oauth2.${self.provider}.identity.email`, '==', decoded.email)
    .get()
    .then(async (snap) => {
      if (snap.size === 0) {
        return resolve(decoded);
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
