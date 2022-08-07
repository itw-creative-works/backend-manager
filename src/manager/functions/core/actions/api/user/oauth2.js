const _ = require('lodash')
const fetch = require('wonderful-fetch');

function Module() {

}

/*
  authorize: redirect or send back the URL for authorization, which will go to UJ page that sends the data back to bm_api
    - if no client_id is provided, fetch from ITW/APP
  tokenize: save the credentials in firestore and redirect or respond with URL to the desired end page
  deauthorize: delete from firestore
  refresh: call refresh on token
*/

Module.prototype.main = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    self.Api.resolveUser({adminRequired: true})
    .then(async (user) => {

      self.ultimateJekyllOAuth2Url = assistant.meta.environment === 'development'
        ? `http://localhost:4000/oauth2`
        : `${Manager.config.brand.url}/oauth2`
      self.oauth2 = null;
      self.omittedPayloadFields = ['redirect', 'referrer', 'service', 'state'];

      // self.ultimateJekyllOAuth2Url = `${Manager.config.brand.url}/oauth2`;

      // Options
      // payload.data.payload.uid = payload.data.payload.uid;
      payload.data.payload.redirect = typeof payload.data.payload.redirect === 'undefined'
        ? true
        : payload.data.payload.redirect

      payload.data.payload.referrer = typeof payload.data.payload.referrer === 'undefined'
        ? (assistant.meta.environment === 'development' ? `http://localhost:4000/oauth2` : `${Manager.config.brand.url}/oauth2`)
        : payload.data.payload.referrer

      payload.data.payload.service = payload.data.payload.service || '';
      payload.data.payload.state = payload.data.payload.state || 'authorize'; // authorize, tokenize, deauthorize, refresh, get
      payload.data.payload.redirect_uri = payload.data.payload.redirect_uri
        ? payload.data.payload.redirect_uri
        : `${Manager.config.brand.url}/authentication/account`;

      // payload.data.payload.parameters = payload.data.payload.parameters || {}

      // payload.data.payload.client_id = payload.data.payload.client_id;
      // payload.data.payload.scope = payload.data.payload.scope;

      let newUrl;
      const state = {
        code: 'success',
        service: payload.data.payload.service,
        authenticationToken: payload.data.authenticationToken,
        serverUrl: `${Manager.project.functionsUrl}/bm_api`,
        referrer: payload.data.payload.referrer,
        redirectUrl: payload.data.payload.redirect_uri,
      }

      assistant.log('OAuth2 payload', payload.data.payload);

      try {
        self.oauth2 = new (require(`./oauth2/${payload.data.payload.service}.js`))();
        self.oauth2.parent = self;
        self.oauth2.Manager = self.Manager;

        newUrl = self.oauth2.urls[payload.data.payload.state]

        // Set parameters
        if (newUrl) {
          newUrl = new URL(newUrl)

          if (payload.data.payload.state === 'authorize') {
            newUrl.searchParams.set('state', JSON.stringify(state));
            newUrl.searchParams.set('client_id', _.get(Manager.config, `oauth2.${payload.data.payload.service}.client_id`));
            newUrl.searchParams.set('scope', payload.data.payload.scope);
            newUrl.searchParams.set('redirect_uri', self.ultimateJekyllOAuth2Url);

            newUrl.searchParams.set('access_type', typeof payload.data.payload.access_type === 'undefined' ? 'offline' : payload.data.payload.access_type)
            newUrl.searchParams.set('include_granted_scopes', typeof payload.data.payload.include_granted_scopes === 'undefined' ? 'true' : payload.data.payload.include_granted_scopes)
            newUrl.searchParams.set('response_type', typeof payload.data.payload.response_type === 'undefined' ? 'code' : payload.data.payload.response_type)
          }

          await self.oauth2.buildUrl(payload.data.payload.state, newUrl)
          .then(url => {
            if (url) {
              newUrl = url;
            }
          })
          .catch(e => { throw e; });
        }

      } catch (e) {
        return reject(e);
      }

      // Process by state
      if (payload.data.payload.state === 'authorize') {
        self.processState_authorize(newUrl)
        .then(r => {resolve(r)})
        .catch(e => {reject(e)})
      } else if (payload.data.payload.state === 'tokenize') {
        self.processState_tokenize(newUrl)
        .then(r => {resolve(r)})
        .catch(e => {reject(e)})
      } else if (payload.data.payload.state === 'deauthorize') {
        self.processState_deauthorize(newUrl)
        .then(r => {resolve(r)})
        .catch(e => {reject(e)})
      }
    })
    .catch(e => {
      return reject(e);
    })
  });

};

Module.prototype.processState_authorize = function (newUrl) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const finalUrl = newUrl.toString();

    return resolve({
      data: {
        authorizationUrl: finalUrl,
      },
      redirect: payload.data.payload.redirect ? finalUrl : null
    });
  });
};

Module.prototype.processState_tokenize = function (newUrl) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const finalUrl = newUrl.toString();

    const body = {
      client_id: _.get(Manager.config, `oauth2.${payload.data.payload.service}.client_id`),
      client_secret: _.get(Manager.config, `oauth2.${payload.data.payload.service}.client_secret`),
      grant_type: 'authorization_code',
      redirect_uri: self.ultimateJekyllOAuth2Url,
      code: payload.data.payload.code,
      // scope: '',
    };

    // console.log('----body', body);

    const tokenizeResponse = await fetch(finalUrl, {
      method: 'POST',
      timeout: 60000,
      response: 'json',
      tries: 2,
      log: true,
      body: new URLSearchParams(body),
      cacheBreaker: false,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    .then(json => json)
    .catch(e => e)

    // console.log('---tokenizeResponse', tokenizeResponse);

    if (tokenizeResponse instanceof Error) {
      return reject(tokenizeResponse);
    }

    // Determine identity
    const verifiedIdentity = await self.oauth2.verifyIdentity(tokenizeResponse)
    .then(identity => identity)
    .catch(e => e);

    // console.log('---verifiedIdentity', verifiedIdentity);

    if (verifiedIdentity instanceof Error) {
      return reject(verifiedIdentity);
    }

    const storeResponse = await self.libraries.admin.firestore().doc(`users/${payload.user.auth.uid}`)
    .set({
      oauth2: {
        [payload.data.payload.service]: {
          code: _.omit(
            _.merge({}, payload.data.payload),
            self.omittedPayloadFields,
          ),
          token: tokenizeResponse,
          identity: verifiedIdentity,
          updated: {
            timestamp: assistant.meta.startTime.timestamp,
            timestampUNIX: assistant.meta.startTime.timestampUNIX,
          }
        }
      }
    }, { merge: true })
    .then(r => r)
    .catch(e => e)

    // console.log('---storeResponse', storeResponse);

    if (storeResponse instanceof Error) {
      return reject(storeResponse);
    }

    return resolve({
      data: {success: true}
    })

  });
};

Module.prototype.processState_deauthorize = function () {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    self.libraries.admin.firestore().doc(`users/${payload.user.auth.uid}`)
    .set({
      oauth2: {
        [payload.data.payload.service]: {},
        updated: {
          timestamp: assistant.meta.startTime.timestamp,
          timestampUNIX: assistant.meta.startTime.timestampUNIX,
        }
      }
    }, { merge: true })
    .then(function(data) {
      return resolve({
        data: {success: true},
      });
    })
    .catch(function(e) {
      return reject(e);
    })
  });
};




Module.prototype.processState_template = function (newUrl) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const finalUrl = newUrl.toString();

    return resolve({
      data: {
        authorizationUrl: finalUrl,
      },
      redirect: payload.data.payload.redirect ? finalUrl : null
    });
  });
};

module.exports = Module;
