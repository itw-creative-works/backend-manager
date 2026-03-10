/**
 * Usage
 * Meant to check and update usage for a user
 * Reads product limits from Manager.config.payment.products
 * Stores usage in the user's firestore document OR in local/temp storage if no user
 */

const moment = require('moment');
const _ = require('lodash');
const hcaptcha = require('hcaptcha');

function Usage(m) {
  const self = this;

  self.Manager = m;

  self.user = null;
  self.options = null;
  self.assistant = null;
  self.storage = null;

  self.paths = {
    user: '',
  }

  self.initialized = false;
}

Usage.prototype.init = function (assistant, options) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;

    // Set options
    options = options || {};
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

    // Setup storage (used for unauthenticated local-mode usage tracking)
    self.storage = Manager.storage({name: 'usage', temporary: true, clear: options.clear, log: options.log});

    // Set local key
    self.key = (options.key || self.assistant.request.geolocation.ip || 'unknown')
      // .replace(/[\.:]/g, '_');

    // Set paths
    self.paths.user = `users.${self.key}`;

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
    options._forceReject = typeof options._forceReject === 'undefined' ? false : options._forceReject;

    // Check for required options
    const monthly = self.getUsage(name);
    const allowed = self.getLimit(name);

    // Log (independent of options.log because this is important)
    if (options.log) {
      assistant.log(`Usage.validate(): Checking ${monthly}/${allowed} for ${name} (${self.key})...`);
    }

    // Reject function
    function _reject() {
      reject(
        assistant.errorify(`You have exceeded your ${name} usage limit of ${monthly}/${allowed}.`, {code: 429})
      );
    }

    // Force reject (for testing/debugging)
    if (options._forceReject) {
      return _reject();
    }

    // Check if they have a white list key
    const hasWhitelistKey = self.options.whitelistKeys.some((key) => key && key === self?.user?.api?.privateKey);
    if (hasWhitelistKey) {
      self.log(`Usage.validate(): Whitelist key found for ${name}`);

      return resolve(true);
    }

    // Check daily caps (for products with rateLimit: 'daily', which is the default)
    const dailyAllowance = self.getDailyAllowance(name);
    if (dailyAllowance !== null) {
      // Flat daily cap: ceil(monthlyLimit / daysInMonth)
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const flatDailyCap = Math.ceil(allowed / daysInMonth);

      // Get today's usage from the daily counter
      const daily = _.get(self.user, `usage.${name}.daily`, 0);

      if (options.log) {
        assistant.log(`Usage.validate(): Daily cap check: ${daily}/${flatDailyCap} today, ${monthly}/${dailyAllowance} proportional (monthly: ${allowed}) for ${name} (${self.key})`);
      }

      // Check flat daily cap (can't exceed ceil(limit/daysInMonth) in a single day)
      if (daily >= flatDailyCap) {
        return reject(
          assistant.errorify(`You have reached your daily usage limit for ${name} (${daily}/${flatDailyCap}). Your monthly limit is ${allowed}.`, {code: 429})
        );
      }

      // Check proportional monthly cap (can't accumulate too fast)
      if (monthly >= dailyAllowance) {
        return reject(
          assistant.errorify(`You have reached your usage limit for ${name} (${monthly}/${dailyAllowance}). Your monthly limit is ${allowed}.`, {code: 429})
        );
      }
    }

    // If they are under the monthly limit, resolve
    if (monthly < allowed) {
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

  // Update total, monthly, daily, and last
  ['total', 'monthly', 'daily', 'last'].forEach((key) => {
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

  // Update monthly
  const resolved = `usage.${name}.monthly`;

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
    return _.get(self.user, `usage.${name}.monthly`, 0);
  } else {
    return self.user.usage;
  }
};

Usage.prototype.getProduct = function (id) {
  const self = this;
  const Manager = self.Manager;

  const products = Manager.config.payment?.products || [];

  // Look up by provided ID, or fall back to user's subscription product
  id = id || self.user.subscription.product.id;

  return products.find(p => p.id === id)
    || products.find(p => p.id === 'basic')
    || {};
};

Usage.prototype.getLimit = function (name) {
  const self = this;

  const limits = self.getProduct().limits || {};

  // Return specific limit or all limits
  if (name) {
    return limits[name] || 0;
  }

  return limits;
};

/**
 * Get the daily allowance cap for a metric
 * Prevents users from burning their entire monthly quota in a single day
 *
 * Uses two checks:
 * 1. Flat daily cap: ceil(monthlyLimit / daysInMonth) — max uses per day
 *    e.g. 100/month in March (31 days) = ceil(100/31) = 4/day
 *    e.g. 10/month in March (31 days) = ceil(10/31) = 1/day
 * 2. Proportional monthly cap: ceil(monthlyLimit * dayOfMonth / daysInMonth) — running total
 *    Ensures users can't accumulate too much too fast even within daily limits
 *
 * Returns null if the product opts out with rateLimit: 'monthly'
 * Products can set rateLimit: 'daily' (default) | 'monthly'
 */
Usage.prototype.getDailyAllowance = function (name) {
  const self = this;

  // Get the product config
  const product = self.getProduct();
  const rateLimit = product.rateLimit || 'daily';

  // If explicitly set to monthly, no daily cap
  if (rateLimit !== 'daily') {
    return null;
  }

  // Get the monthly limit
  const monthlyLimit = self.getLimit(name);
  if (!monthlyLimit) {
    return null;
  }

  // Calculate caps
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // Proportional monthly cap — how much should be used by this day at most
  // ceil ensures at least 1 usage per day even with very low limits
  return Math.ceil(monthlyLimit * (dayOfMonth / daysInMonth));
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

module.exports = Usage;
