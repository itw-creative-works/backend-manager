const _ = require('lodash')
const fetch = require('wonderful-fetch');
const { arrayify } = require('node-powertools');

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
      self.omittedPayloadFields = ['redirect', 'referrer', 'provider', 'state'];

      // self.ultimateJekyllOAuth2Url = `${Manager.config.brand.url}/oauth2`;

      // Options
      // payload.data.payload.uid = payload.data.payload.uid;
      payload.data.payload.redirect = typeof payload.data.payload.redirect === 'undefined'
        ? true
        : payload.data.payload.redirect

      payload.data.payload.referrer = typeof payload.data.payload.referrer === 'undefined'
        ? (assistant.meta.environment === 'development' ? `http://localhost:4000/authentication/account` : `${Manager.config.brand.url}/authentication/account`)
        : payload.data.payload.referrer

      payload.data.payload.serverUrl = typeof payload.data.payload.serverUrl === 'undefined'
        ? (assistant.meta.environment === 'development' ? `${Manager.project.functionsUrl}/bm_api` : `${Manager.project.functionsUrl}/bm_api`)
        : payload.data.payload.serverUrl

      payload.data.payload.provider = payload.data.payload.provider || '';
      payload.data.payload.state = payload.data.payload.state || 'authorize'; // authorize, tokenize, deauthorize, refresh, get
      payload.data.payload.redirect_uri = payload.data.payload.redirect_uri
        ? payload.data.payload.redirect_uri
        : payload.data.payload.referrer;

      // payload.data.payload.parameters = payload.data.payload.parameters || {}

      // payload.data.payload.client_id = payload.data.payload.client_id;
      // payload.data.payload.scope = payload.data.payload.scope;

      let newUrl;
      const client_id = _.get(Manager.config, `oauth2.${payload.data.payload.provider}.client_id`);
      const state = {
        code: 'success',
        provider: payload.data.payload.provider,
        authenticationToken: payload.data.authenticationToken,
        serverUrl: payload.data.payload.serverUrl,
        referrer: payload.data.payload.referrer,
        redirectUrl: payload.data.payload.redirect_uri,
      }

      assistant.log('OAuth2 payload', payload.data.payload, {environment: 'production'});

      if (!payload.data.payload.provider) {
        return reject(new Error(`The provider parameter is required.`));
      }

      try {
        self.oauth2 = new (require(`./oauth2/${payload.data.payload.provider}.js`))();
        self.oauth2.parent = self;
        self.oauth2.Manager = self.Manager;
        self.oauth2.assistant = self.assistant;

        newUrl = self.oauth2.urls[payload.data.payload.state]

        // Set parameters
        if (newUrl) {
          newUrl = new URL(newUrl)

          if (payload.data.payload.state === 'authorize') {
            if (!client_id) {
              throw new Error(`Missing client_id for ${payload.data.payload.provider} provider`)
            }
            newUrl.searchParams.set('state', JSON.stringify(state));
            newUrl.searchParams.set('client_id', client_id);
            newUrl.searchParams.set('scope', arrayify(payload.data.payload.scope).join(' '));
            newUrl.searchParams.set('redirect_uri', self.ultimateJekyllOAuth2Url);

            newUrl.searchParams.set('access_type', typeof payload.data.payload.access_type === 'undefined' ? 'offline' : payload.data.payload.access_type)
            newUrl.searchParams.set('include_granted_scopes', typeof payload.data.payload.include_granted_scopes === 'undefined' ? 'true' : payload.data.payload.include_granted_scopes)
            newUrl.searchParams.set('response_type', typeof payload.data.payload.response_type === 'undefined' ? 'code' : payload.data.payload.response_type)
          }

          assistant.log('OAuth2 newUrl', newUrl, {environment: 'production'});

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
      } else if (payload.data.payload.state === 'status') {
        self.processState_status(newUrl)
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
        url: finalUrl,
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

    assistant.log('Running processState_tokenize()', {environment: 'production'});

    const body = {
      client_id: _.get(Manager.config, `oauth2.${payload.data.payload.provider}.client_id`),
      client_secret: _.get(Manager.config, `oauth2.${payload.data.payload.provider}.client_secret`),
      grant_type: 'authorization_code',
      redirect_uri: self.ultimateJekyllOAuth2Url,
      code: payload.data.payload.code,
      // scope: '',
    };

    assistant.log('body', body, {environment: 'production'});

    const tokenizeResponse = await fetch(finalUrl, {
      method: 'POST',
      timeout: 60000,
      response: 'json',
      tries: 1,
      log: true,
      body: new URLSearchParams(body),
      cacheBreaker: false,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    .then(json => json)
    .catch(e => e)

    assistant.log('tokenizeResponse', tokenizeResponse, {environment: 'production'});

    if (tokenizeResponse instanceof Error) {
      return reject(tokenizeResponse);
    }

    // Determine identity
    const verifiedIdentity = await self.oauth2.verifyIdentity(tokenizeResponse)
    .then(identity => identity)
    .catch(e => e);

    assistant.log('verifiedIdentity', verifiedIdentity, {environment: 'production'});

    if (verifiedIdentity instanceof Error) {
      return reject(verifiedIdentity);
    } else if (tokenizeResponse && !tokenizeResponse.refresh_token) {
      return reject(new Error(`Missing "refresh_token" in response. This is likely because you disconnected your account and tried to reconnect it. Visit ${self.oauth2.urls.removeAccess} and remove our app from your account and then try again or contact us if you need help!`));
    }

    const storeResponse = await self.libraries.admin.firestore().doc(`users/${payload.user.auth.uid}`)
    .set({
      oauth2: {
        [payload.data.payload.provider]: {
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

    assistant.log('storeResponse', storeResponse, {environment: 'production'});

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
        [payload.data.payload.provider]: {},
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

Module.prototype.processState_status = function (newUrl) {
  const self = this;
  const Manager = self.Manager;
  const Api = self.Api;
  const assistant = self.assistant;
  const payload = self.payload;

  return new Promise(async function(resolve, reject) {
    const finalUrl = newUrl.toString();

    payload.data.payload.removeInvalidTokens = typeof payload.data.payload.removeInvalidTokens === 'undefined'
      ? true
      : payload.data.payload.removeInvalidTokens;

    function _remove() {
      return new Promise(function(resolve, reject) {
        if (!payload.data.payload.removeInvalidTokens) {
          return resolve();
        }

        Manager.libraries.admin.firestore().doc(`users/${payload.user.auth.uid}`)
        .set({
          oauth2: {
            [payload.data.payload.provider]: {},
            updated: {
              timestamp: assistant.meta.startTime.timestamp,
              timestampUNIX: assistant.meta.startTime.timestampUNIX,
            }
          }
        }, { merge: true })
        .then(async () => {
          assistant.log(`Removed disconnected token for user: ${payload.user.auth.uid}`)
        })
        .catch((e) => e)
        .finally(() => {
          return resolve();
        })
      });
    }

    Manager.libraries.admin.firestore().doc(`users/${payload.user.auth.uid}`)
    .get()
    .then(async (doc) => {
      const data = doc.data();
      const token = _.get(data, `oauth2.${payload.data.payload.provider}.token.refresh_token`, '');
      // const token = _.get(data, `oauth2.${payload.data.payload.provider}.token.access_token`, '');
      if (!token) {
        return resolve({
          data: {status: 'disconnected'}
        });
      } else if (!self.oauth2.verifyConnection) {
        return resolve({
          data: {status: 'connected'}
        });
      } else {
        // self.oauth2.verifyConnection(finalUrl.replace(/{token}/ig, encodeURIComponent(token)), token)
        self.oauth2.verifyConnection(finalUrl.replace(/{token}/ig, token), token)
        .then(async (status) => {
          if (status === 'disconnected') {
            await _remove();
          }
          return resolve({
            data: {status: status},
          })
        })
        .catch(async (e) => {
          await _remove();
          return resolve({
            data: {status: 'error', error: e.message},
          })
        })
      }
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
        url: finalUrl,
      },
      redirect: payload.data.payload.redirect ? finalUrl : null
    });
  });
};



module.exports = Module;
