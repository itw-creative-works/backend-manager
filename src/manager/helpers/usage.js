/**
 * Usage
 * Meant to check and update usage for a user
 * Uses the ITWCW apps/{app}/products/{product}/limits/{metric} to check limits
 * Stores usage in the user's firestore document OR in local/temp storage if no user
 */

const fetch = require('wonderful-fetch');
const moment = require('moment');
const _ = require('lodash');
const hcaptcha = require('hcaptcha');

function Usage(m) {
  const self = this;

  self.Manager = m;

  self.user = null;
  self.app = null;
  self.options = null;
  self.assistant = null;
  self.storage = null;

  self.paths = {
    user: '',
    app: '',
  }

  self.initialized = false;
}

Usage.prototype.init = function (assistant, options) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;

    // Set options
    options = options || {};
    options.app = options.app || Manager.config.app.id;
    options.refetch = typeof options.refetch === 'undefined' ? false : options.refetch;
    options.clear = typeof options.clear === 'undefined' ? false : options.clear;
    options.today = typeof options.today === 'undefined' ? undefined : options.today;
    options.key = typeof options.key === 'undefined' ? undefined : options.key;
    options.unauthenticatedMode = typeof options.unauthenticatedMode === 'undefined' ? 'firestore' : options.unauthenticatedMode;
    options.whitelistKeys = options.whitelistKeys || [];
    options.log = typeof options.log === 'undefined' ? assistant.isDevelopment() : options.log;

    // Check for required options
    if (!assistant) {
      return reject(new Error('Missing required {assistant} parameter'));
    }

    // Add BEM to whitelist keys
    options.whitelistKeys.push(process.env.BACKEND_MANAGER_KEY);

    // Set options
    self.options = options;

    // Set assistant
    self.assistant = assistant;

    // Setup storage
    self.storage = Manager.storage({name: 'usage', temporary: true, clear: options.clear, log: options.log});

    // Set local key
    self.key = (options.key || self.assistant.request.geolocation.ip || '')
      // .replace(/[\.:]/g, '_');

    // Set paths
    self.paths.user = `users.${self.key}`;
    self.paths.app = `apps.${options.app}`;

    // Get storage data
    const appLastFetched = moment(self.storage.get(`${self.paths.app}.lastFetched`, 0).value());
    const diff = moment().diff(appLastFetched, 'hours');

    // Authenticate user (user will be resolved as well)
    self.user = await assistant.authenticate();

    self.useUnauthenticatedStorage = !self.user.auth.uid || self.options.key;

    // Load usage with temporary if unauthenticated
    if (self.useUnauthenticatedStorage) {
      let foundUsage;

      if (options.unauthenticatedMode === 'firestore') {
        // TODO: Make it request using .where() query so it doesnt use a read if it doesnt have to
        foundUsage = await Manager.libraries.admin.firestore().doc(`usage/${self.key}`)
          .get()
          .then((r) => r.data())
          .catch((e) => {
            assistant.errorify(`Usage.init(): Error fetching usage data: ${e}`, {code: 500, sentry: true});
          });
      } else {
        foundUsage = self.storage.get(`${self.paths.user}.usage`, {}).value();
      }

      self.user.usage = foundUsage ? foundUsage : self.user.usage;
    }

    // Log
    self.log(`Usage.init(): Checking if usage data needs to be fetched (${diff} hours)...`);

    // Get app data to get plan limits using cached data if possible
    if (diff > 1 || options.refetch) {
      await self.getApp(options.app)
        .then((json) => {
          // Write data and last fetched to storage
          self.storage.set(`${self.paths.app}.data`, json).write();
          self.storage.set(`${self.paths.app}.lastFetched`, new Date().toISOString()).write();
        })
        .catch(e => {
          assistant.errorify(`Usage.init(): Error fetching app data: ${e}`, {code: 500, sentry: true});
        });
    }

    // Get app data
    self.app = self.storage.get(`${self.paths.app}.data`, {}).value();

    // Check for app data
    if (!self.app) {
      return reject(new Error('Usage.init(): No app data found'));
    }

    // Log
    self.log(`Usage.init(): Got app data`, self.app);
    self.log(`Usage.init(): Got user`, self.user);

    // Set initialized to true
    self.initialized = true;

    // Resolve
    return resolve(self);
  });
};

Usage.prototype.validate = function (name, options) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;

    // Set options
    options = options || {};
    options.useCaptchaResponse = typeof options.useCaptchaResponse === 'undefined' ? true : options.useCaptchaResponse;
    options.log = typeof options.log === 'undefined' ? true : options.log;
    options.throw = typeof options.throw === 'undefined' ? false : options.throw;

    // Check for required options
    const period = self.getUsage(name);
    const allowed = self.getLimit(name);

    // Log (independent of options.log because this is important)
    if (options.log) {
      assistant.log(`Usage.validate(): Checking ${period}/${allowed} for ${name} (${self.key})...`);
    }

    // Reject function
    function _reject() {
      reject(
        assistant.errorify(`You have exceeded your ${name} usage limit of ${period}/${allowed}.`, {code: 429})
      );
    }

    // Dev mode throw
    if (options.throw) {
      return _reject();
    }

    // Check if they have a white list key
    const hasWhitelistKey = self.options.whitelistKeys.some((key) => key && key === self?.user?.api?.privateKey);
    if (hasWhitelistKey) {
      self.log(`Usage.validate(): Whitelist key found for ${name}`);

      return resolve(true);
    }

    // If they are under the limit, resolve
    if (period < allowed) {
      self.log(`Usage.validate(): Valid for ${name}`);

      return resolve(true);
    }

    // If they are using captcha, attempt to resolve
    const captchaResponse = assistant.request.data['h-captcha-response'];
    if (captchaResponse && options.useCaptchaResponse) {
      self.log(`Usage.validate(): Checking captcha response`, captchaResponse);

      const captchaResult = await hcaptcha.verify(process.env.HCAPTCHA_SECRET, captchaResponse)
        .then((data) => data)
        .catch((e) => e);

      // If the captcha is valid, resolve
      if (!captchaResult || captchaResult instanceof Error || !captchaResult.success) {
        return reject(
          assistant.errorify(`Captcha verification failed.`, {code: 400})
        );
      }
    }

    // Otherwise, they are over the limit, reject
    return _reject();
  });
};

Usage.prototype.increment = function (name, value, options) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  // Set name
  name = name || 'requests';

  // Set value
  value = typeof value === 'undefined' ? 1 : value;

  // Set options
  options = options || {};
  options.id = options.id || null;

  // Update total and period
  ['total', 'period', 'last'].forEach((key) => {
    const resolved = `usage.${name}.${key}`;
    const existing = _.get(self.user, resolved, 0);

    if (key === 'last') {
      const now = moment(
        typeof self.options.today === 'undefined' ? new Date() : self.options.today
      );

      _.set(self.user, resolved, {
        id: options.id,
        timestamp: now.toISOString(),
        timestampUNIX: now.unix(),
      });
    } else {
      _.set(self.user, resolved, existing + value);
    }
  });

  // Log the updated user
  self.log(`Usage.init(): Incremented ${name} for user`, self.user);

  return self;
};

Usage.prototype.set = function (name, value) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  // Set name
  name = name || 'requests';

  // Set value
  value = typeof value === 'undefined' ? 0 : value;

  // Update total and period
  const resolved = `usage.${name}.period`;

  // Set the value
  _.set(self.user, resolved, value);

  // Log the updated user
  self.log(`Usage.init(): Set ${name} for user`, self.user);

  return self;
};

Usage.prototype.getUsage = function (name) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  // Get usage
  if (name) {
    return _.get(self.user, `usage.${name}.period`, 0);
  } else {
    return self.user.usage;
  }
};

Usage.prototype.getLimit = function (name) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  // Get key
  const key = `products.${self.options.app}-${self.user.plan.id}.limits`;

  // Get limit
  if (name) {
    return _.get(self.app, `${key}.${name}`, 0);
  } else {
    return _.get(self.app, key, {});
  }
};

Usage.prototype.update = function () {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const assistant = self.assistant;

  return new Promise(async function(resolve, reject) {
    const { admin } = Manager.libraries;

    // Write self.user to firestore or local if no user or if key is set
    if (self.useUnauthenticatedStorage) {
      if (self.options.unauthenticatedMode === 'firestore') {
        admin.firestore().doc(`usage/${self.key}`)
          .set(self.user.usage, { merge: true })
          .then(() => {
            self.log(`Usage.update(): Updated user.usage in firestore`, self.user.usage);

            return resolve(self.user.usage);
          })
          .catch(e => {
            return reject(assistant.errorify(e, {code: 500, sentry: true}));
          });
      } else {
        self.storage.set(`${self.paths.user}.usage`, self.user.usage).write();

        self.log(`Usage.update(): Updated user.usage in local storage`, self.user.usage);

        return resolve(self.user.usage);
      }
    } else {
      admin.firestore().doc(`users/${self.user.auth.uid}`)
        .set({
          usage: self.user.usage,
        }, { merge: true })
        .then(() => {
          self.log(`Usage.update(): Updated user.usage in firestore`, self.user.usage);

          return resolve(self.user.usage);
        })
        .catch(e => {
          return reject(assistant.errorify(e, {code: 500, sentry: true}));
        });
    }
  });
};

Usage.prototype.addWhitelistKeys = function (keys) {
  const self = this;

  const options = self.options;

  // Make keys and array if not already
  keys = Array.isArray(keys) ? keys : [keys];

  // Add keys to whitelist
  options.whitelistKeys = options.whitelistKeys.concat(keys);

  // Log
  return self;
};

Usage.prototype.log = function () {
  const self = this;

  // Log
  if (self.options.log) {
    self.assistant.log(...arguments);
  }
};

Usage.prototype.getApp = function (id) {
  const self = this;

  // Shortcuts
  const Manager = self.Manager;
  const assistant = self.assistant;

  return new Promise(function(resolve, reject) {
    const { admin } = Manager.libraries;

    try {
      // If we're on ITW, we can read directly from Firestore
      // If we don't do this, calling getApp on ITW will call getApp on ITW again and again
      if (Manager.config.app.id === 'itw-creative-works') {
        admin.firestore().doc(`apps/${id}`)
          .get()
          .then((r) => {
            const data = r.data();

            // Check for data
            if (!data) {
              return reject(new Error('No data found'));
            }

            // Resolve
            return resolve(data);
          })
          .catch((e) => reject(e));
      } else {
        fetch('https://us-central1-itw-creative-works.cloudfunctions.net/getApp', {
          method: 'post',
          response: 'json',
          body: {
            id: id,
          },
        })
        .then((json) => resolve(json))
        .catch((e) => reject(e));
      }
    } catch (e) {
      return reject(e);
    }
  });
};

module.exports = Usage;
