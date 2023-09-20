const moment = require('moment');
const fetch = require('node-fetch');
const uuidv5 = require('uuid').v5;
const { get, set, merge } = require('lodash');

let sampleUser = {
  api: {},
  auth: {},
  plan: {
    id: '',
    limits: {

    }
  },
  authenticated: false,
  _APIManager: {
    meta: {
      lastStatsReset: new Date(),
      lastUserFetch: new Date(),
    }
  }
}

function ApiManager(m) {
  const self = this;
  self.Manager = m;
  self.options = {
    appId: '',
    plans: {},
    maxUsersStored: 10000,
    refetchInterval: 60,
    resetInterval: 60 * 24,
    officialAPIKeys: [],
  };
  self.userList = [];
  self.initialized = false;
}

ApiManager.prototype.init = function (options) {
  const self = this;
  return new Promise(async function(resolve, reject) {
    options = options || {};
    options.app = options.app || '';
    options.plans = options.plans || {};

    // await self.Manager.libraries.admin.firestore
    // options.plans.basic = options.plans.basic || {requests: 100};

    options.maxUsersStored = options.maxUsersStored || 10000;
    options.refetchInterval = options.refetchInterval || 60;
    options.resetInterval = options.resetInterval || (60 * 24);
    options.officialAPIKeys = options.officialAPIKeys || [];
    options.whitelistedAPIKeys = options.whitelistedAPIKeys || [];

    await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/getApp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: options.app,
      }),
    })
    .then(res => {
      res.text()
      .then(text => {
        if (res.ok) {
          const data = JSON.parse(text);

          options.plans = {};

          Object.keys(data.products)
          .forEach((id, i) => {
            const product = data.products[id]
            options.plans[product.planId] = {}
            options.plans[product.planId].limits = product.limits || {};
          });

          self.options = options;
          self.initialized = true;

          return resolve(self);
        } else {
          throw new Error(text || res.statusText || 'Unknown error.')
        }
      })
    })
    .catch(e => {
      return reject(e)
    })
  });
};

ApiManager.prototype._createNewUser = function (authenticatedUser, planId, persistentData, isRefetch, apiKey) {
  const self = this;
  const _APIManager_default = {
    stats: {
      requests: 0,
    },
    meta: {
      lastStatsReset: new Date(),
      lastUserFetch: new Date(),
    },
    providedAPIKey: apiKey,
  }
  persistentData = persistentData || {};
  persistentData._APIManager = persistentData._APIManager || merge({}, _APIManager_default);

  let newUser = {
    api: get(authenticatedUser, 'api', {}),
    auth: get(authenticatedUser, 'auth', {}),
    plan: {
      id: planId,
      limits: {
      }
    },
    authenticated: authenticatedUser.authenticated,
    ip: authenticatedUser.ip,
    country: authenticatedUser.country,
    _APIManager: merge({}, _APIManager_default),
  }

  // Setup newUser
  const currentPlan = get(self.options, `plans.${planId}.limits`, {})
  Object.keys(currentPlan)
  .forEach((id, i) => {
    // console.log('----id', id);
    // console.log('======currentPlan[id]', currentPlan[id]);
    newUser.plan.limits[id] = get(authenticatedUser, `plan.limits.${id}`, currentPlan[id])
    // const product = data.products[id]
    // options.plans[product.planId] = {}
    // options.plans[product.planId].limits = product.limits || {};
  });



  // console.log('-----MIN', moment().diff(moment(persistentData._APIManager.meta.lastStatsReset), 'minutes', true), self.options.resetInterval);
  if (moment().diff(moment(persistentData._APIManager.meta.lastStatsReset), 'minutes', true) < self.options.resetInterval) {
    newUser._APIManager.meta.lastStatsReset = persistentData._APIManager.meta.lastStatsReset || newUser._APIManager.meta.lastStatsReset;
    newUser._APIManager.meta.lastUserFetch = persistentData._APIManager.meta.lastUserFetch || newUser._APIManager.meta.lastUserFetch;
    Object.keys(persistentData._APIManager.stats)
    .forEach((key, i) => {
      newUser._APIManager.stats[key] = persistentData._APIManager.stats[key];
    });
  } else {
    // console.log('---RESSET INTERVAL REACHED');
    newUser._APIManager.meta.lastUserFetch = persistentData._APIManager.meta.lastUserFetch;
  }

  if (isRefetch) {
    newUser._APIManager.meta.lastUserFetch = new Date();
  }

  return newUser;
}

ApiManager.prototype.getUser = async function (assistant) {
  const self = this;

  let newUser;
  let apiKey = assistant.request.data.apiKey;
  let authenticatedUser;
  let persistentData = {set: false};
  // console.log('---getuser for', apiKey);
  if (apiKey) {
    newUser = self.userList.filter(user => user.api.privateKey === apiKey);
    if (newUser[0]) {
      if (newUser.length > 1 || moment().diff(moment(newUser[0]._APIManager.meta.lastUserFetch), 'minutes', true) > self.options.refetchInterval) {
        // console.log('----REFETCHING');
        persistentData = {set: true, _APIManager: merge({}, newUser[0]._APIManager)};

        self.userList = self.userList.filter(user => user.api.privateKey !== apiKey)
        newUser = null;
      } else {
        persistentData = {set: true, _APIManager: merge({}, newUser[0]._APIManager)};

        newUser = newUser[0];
      }
    } else {
      newUser = null;
    }
  }

  // console.log('---persistentData', persistentData);

  if (!newUser) {
    // console.log('---doesnt exist so reauthing');
    authenticatedUser = await assistant.authenticate({apiKey: apiKey});
    // console.log('---authenticatedUser', authenticatedUser);
    const planId = get(authenticatedUser, 'plan.id', 'basic');
    let workingUID = !authenticatedUser.authenticated
      ? uuidv5(assistant.request.geolocation.ip, '1b671a64-40d5-491e-99b0-da01ff1f3341')
      : authenticatedUser.auth.uid
    authenticatedUser.ip = assistant.request.geolocation.ip;
    authenticatedUser.country = assistant.request.geolocation.country;
    // console.log('---workingUID', workingUID);
    // console.log('----self.userList', self.userList);
    let existingUser = self.userList.find(user => user.auth.uid === workingUID);
    if (existingUser) {
      // console.log('---actually does exist so setting');
      // console.log('----1111 MIN lastUserFetch', moment().diff(moment(existingUser._APIManager.meta.lastUserFetch), 'minutes', true), self.options.refetchInterval);
      persistentData = !persistentData.set ? {set: true, _APIManager: merge({}, existingUser._APIManager)} : persistentData;
      // console.log('----persistentData 2', persistentData);
      if (moment().diff(moment(existingUser._APIManager.meta.lastUserFetch), 'minutes', true) > self.options.refetchInterval) {
        // console.log('----REFETCHING');
        self.userList = self.userList.filter(user => user.auth.uid !== workingUID)
        existingUser = self._createNewUser(authenticatedUser, planId, persistentData, true, apiKey);
        existingUser.auth.uid = workingUID;
        self.userList = self.userList.concat(existingUser);
      }
      newUser = existingUser
    } else {
      // console.log('---actually doesnt exist making new user');
      newUser = self._createNewUser(authenticatedUser, planId, persistentData, false, apiKey)
      newUser.auth.uid = workingUID;
      self.userList = self.userList.concat(newUser);
    }

  }

  return newUser;
  // console.log('---workingUID', workingUID);

};

function _getUserStat(self, user, stat, def) {
  const isWhitelistedAPIKey = self.options.whitelistedAPIKeys.includes(
    get(user, `api.privateKey`, get(user, `_APIManager.providedAPIKey`))
  );
  // console.log('----user', user);
  // console.log('----isWhitelistedAPIKey', isWhitelistedAPIKey);
  return {
    current: !isWhitelistedAPIKey ? get(user, `_APIManager.stats.${stat}`, typeof def !== 'undefined' ? def : 0) : 0,
    limit: !isWhitelistedAPIKey ? get(user, `plan.limits.${stat}`, typeof def !== 'undefined' ? def : 0) : Infinity,
  }
}

ApiManager.prototype.isUserOverStat = function (user, stat, def, frame) {
  const self = this;
  if (!user || !stat) {
    throw new Error('<user> and <stat> required')
  }
  const result = self.getUserStat(user, stat, def);
  frame = frame || 'daily';
  let limit = result.limit;
  // console.log('---result', result);
  // console.log('---typeof result.current', typeof result.current);
  // console.log('----limit', limit);
  if (typeof result.limit === 'number') {
    if (frame === 'daily') {
      limit = Math.floor(result.limit / 31);
    }
    // console.log('----limit', limit);
    // console.log('-----result.current < limit', result.current < limit);
    return limit >= result.current;
  }

  return false;
}

ApiManager.prototype.getUserStat = function (user, stat, def, ) {
  const self = this;
  if (!user || !stat) {
    throw new Error('<user> and <stat> required')
  }
  return _getUserStat(self, user, stat, def);
}

ApiManager.prototype.incrementUserStat = function (user, stat, amount) {
  const self = this;
  if (!user || !stat) {
    throw new Error('<user> and <stat> required')
  }
  set(user, `_APIManager.stats.${stat}`, get(user, `_APIManager.stats.${stat}`, 0) + amount)
  return _getUserStat(self, user, stat, 0);
}


ApiManager.prototype.validateOfficialRequest = async function (assistant, apiUser) {
  const self = this
  let data = assistant.request.data;
  let multipartData;
  assistant.ref.Manager.libraries.hcaptcha = assistant.ref.Manager.libraries.hcaptcha || assistant.ref.Manager.require('hcaptcha');
  const hcaptcha = assistant.ref.Manager.libraries.hcaptcha;

  const contentType = get(assistant.ref.req.headers, 'content-type', '');
  const requestType = !contentType || contentType.includes('application/json') ? 'json' : 'form';

  // console.log('----requestType', requestType);
  if (requestType !== 'json') {
    multipartData = await assistant.parseMultipartFormData();
    data = multipartData.fields;
    // console.log('----multipartData', multipartData);
  }

  if (self.options.officialAPIKeys.includes(data.apiKey)) {
      const captchaResult = await hcaptcha.verify(process.env.HCAPTCHA_SECRET, data['h-captcha-response'])
        .then((data) => data)
        .catch((e) => e);
      if (!captchaResult || captchaResult instanceof Error || !captchaResult.success) {
        // console.log(`Cap`);
        assistant.ref.res.status(400).send(new Error(`Captcha verification failed.`).message);
        return {
          ok: false,
          official: true,
          verified: false,
        }
      } else {
        self.incrementUserStat(apiUser, 'requests', -1);
        return {
          ok: true,
          official: true,
          verified: true,
        }
      }
      // workingUser.requestsCurrent--;
  } else {
    return {
      ok: true,
      official: false,
      verified: true,
    }
  }
}

module.exports = ApiManager;
