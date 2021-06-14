const moment = require('moment');
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
  _meta: {
    lastStatsReset: new Date(),
    lastUserFetch: new Date(),
  }
}

function ApiManager() {
  const self = this;
  self.options = {
    planData: {},
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
  options = options || {};
  options.planData = options.planData || {};
  options.planData.basic = options.planData.basic || {requests: 93};

  options.maxUsersStored = options.maxUsersStored || 10000;
  options.refetchInterval = options.refetchInterval || 60;
  options.resetInterval = options.resetInterval || (60 * 24);
  options.officialAPIKeys = options.officialAPIKeys || [];

  self.options = options;

  self.initialized = true;

  return self;
};

ApiManager.prototype._createNewUser = function (authenticatedUser, planId, persistentData, isRefetch) {
  const self = this;
  persistentData = persistentData || {};
  persistentData._meta = persistentData._meta || {};
  persistentData._stats = persistentData._stats || {};

  let newUser = {
    api: get(authenticatedUser, 'api', {}),
    auth: get(authenticatedUser, 'auth', {}),
    plan: {
      id: planId,
      limits: {
        requests: get(authenticatedUser, 'plan.limits.requests', get(self.options, `planData.${planId}.limits.requests`, 93)),
      }
    },
    authenticated: authenticatedUser.authenticated,
    ip: authenticatedUser.ip,
    country: authenticatedUser.country,
    _stats: {
      requests: 0,
    },
    _meta: {
      lastStatsReset: new Date(),
      lastUserFetch: new Date(),
    }
  }
  // console.log('-----MIN', moment().diff(moment(persistentData._meta.lastStatsReset), 'minutes', true), self.options.resetInterval);
  if (moment().diff(moment(persistentData._meta.lastStatsReset), 'minutes', true) < self.options.resetInterval) {
    newUser._meta.lastStatsReset = persistentData._meta.lastStatsReset || newUser._meta.lastStatsReset;
    newUser._meta.lastUserFetch = persistentData._meta.lastUserFetch || newUser._meta.lastUserFetch;
    Object.keys(persistentData._stats)
    .forEach((key, i) => {
      newUser._stats[key] = persistentData._stats[key];
    });
  } else {
    // console.log('---RESSET INTERVAL REACHED');
    newUser._meta.lastUserFetch = persistentData._meta.lastUserFetch;
  }

  if (isRefetch) {
    newUser._meta.lastUserFetch = new Date();
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
      if (newUser.length > 1 || moment().diff(moment(newUser[0]._meta.lastUserFetch), 'minutes', true) > self.options.refetchInterval) {
        // console.log('----REFETCHING');
        persistentData = {set: true, _stats: merge({}, newUser[0]._stats), _meta: merge({}, newUser[0]._meta)};

        self.userList = self.userList.filter(user => user.api.privateKey !== apiKey)
        newUser = null;
      } else {
        persistentData = {set: true, _stats: merge({}, newUser[0]._stats), _meta: merge({}, newUser[0]._meta)};

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
      ? uuidv5(assistant.request.ip, '1b671a64-40d5-491e-99b0-da01ff1f3341')
      : authenticatedUser.auth.uid
    authenticatedUser.ip = assistant.request.ip;
    authenticatedUser.country = assistant.request.country;
    // console.log('---workingUID', workingUID);
    // console.log('----self.userList', self.userList);
    let existingUser = self.userList.find(user => user.auth.uid === workingUID);
    if (existingUser) {
      // console.log('---actually does exist so setting');
      // console.log('----1111 MIN lastUserFetch', moment().diff(moment(existingUser._meta.lastUserFetch), 'minutes', true), self.options.refetchInterval);
      persistentData = !persistentData.set ? {set: true, _stats: merge({}, existingUser._stats), _meta: merge({}, existingUser._meta)} : persistentData;
      // console.log('----persistentData 2', persistentData);
      if (moment().diff(moment(existingUser._meta.lastUserFetch), 'minutes', true) > self.options.refetchInterval) {
        // console.log('----REFETCHING');
        self.userList = self.userList.filter(user => user.auth.uid !== workingUID)
        existingUser = self._createNewUser(authenticatedUser, planId, persistentData, true);
        existingUser.auth.uid = workingUID;
        self.userList = self.userList.concat(existingUser);
      }
      newUser = existingUser
    } else {
      // console.log('---actually doesnt exist making new user');
      newUser = self._createNewUser(authenticatedUser, planId, persistentData)
      newUser.auth.uid = workingUID;
      self.userList = self.userList.concat(newUser);
    }

  }

  return newUser;
  // console.log('---workingUID', workingUID);

};

ApiManager.prototype.getUserStat = function (user, stat, def) {
  const self = this;
  if (!user || !stat) {
    throw new Error('<user> and <stat> required')
  }
  return {
    current: get(user, `_stats.${stat}`, def || 0),
    limit: get(user, `plan.limits.${stat}`, def || 0),
  }
}

ApiManager.prototype.incrementUserStat = function (user, stat, amount) {
  const self = this;
  if (!user || !stat) {
    throw new Error('<user> and <stat> required')
  }
  set(user, `_stats.${stat}`, get(user, `_stats.${stat}`, 0) + amount)
  return {
    current: get(user, `_stats.${stat}`, 0),
    limit: get(user, `plan.limits.${stat}`, 0),
  }
}


ApiManager.prototype.validateOfficialRequest = async function (assistant, apiUser) {
  const self = this
  let data = assistant.request.data;
  let isOfficial = self.options.officialAPIKeys.includes(data.apiKey);
  assistant.ref.Manager.libraries.hcaptcha = assistant.ref.Manager.libraries.hcaptcha || assistant.ref.Manager.require('hcaptcha');
  const hcaptcha = assistant.ref.Manager.libraries.hcaptcha;

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
