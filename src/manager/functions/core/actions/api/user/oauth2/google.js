const decode = require('jwt-decode')

function OAuth2() {
  const self = this;
  self.service = 'google';
  self.name = 'Google';
  self.urls = {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenize: 'https://oauth2.googleapis.com/token',
  }
}

OAuth2.prototype.buildUrl = function (state, url) {
  const self = this;

  return new Promise(function(resolve, reject) {
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

  return new Promise(function(resolve, reject) {
    const decoded = decode(tokenizeResult.id_token);

    // console.log('---decoded', decoded);

    // Check if exists
    Manager.libraries.admin.firestore().collection(`users`)
    .where(`oauth2.${self.service}.identity.email`, '==', decoded.email)
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

module.exports = OAuth2;
