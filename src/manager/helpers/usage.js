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
    options.log = typeof options.log === 'undefined' ? false : options.log;

    // Check for required options
    if (!assistant) {
      return reject(new Error('Missing required {assistant} parameter'));
    }

    // Set options
    self.options = options;

    // Set assistant
    self.assistant = assistant;

    // Setup storage
    self.storage = Manager.storage({name: 'usage', temporary: true, clear: options.clear, log: options.log});

    // Set local key
    self.key = (options.key || self.assistant.request.geolocation.ip || '')
      .replace(/[\.:]/g, '_');

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
        foundUsage = await Manager.libraries.admin.firestore().doc(`temporary/usage`)
          .get()
          .then((r) => _.get(r.data(), self.key))
          .catch((e) => {
            assistant.errorify(`Usage.init(): Error fetching usage data: ${e}`, {sentry: true, send: false, log: true});
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
      await fetch('https://us-central1-itw-creative-works.cloudfunctions.net/getApp', {
        method: 'post',
        response: 'json',
        body: {
          id: options.app,
        },
      })
      .then((json) => {
        // Write data and last fetched to storage
        self.storage.set(`${self.paths.app}.data`, json).write();
        self.storage.set(`${self.paths.app}.lastFetched`, new Date().toISOString()).write();
      })
      .catch(e => {
        assistant.errorify(`Usage.init(): Error fetching app data: ${e}`, {sentry: true, send: false, log: true});
      })
    }

    // Get app data
    self.app = self.storage.get(`${self.paths.app}.data`, {}).value();

    if (!self.app) {
      return reject(new Error('Usage.init(): No app data found'));
    }

    self.log(`Usage.init(): Got app data`, self.app);
    self.log(`Usage.init(): Got user`, self.user);

    // Set initialized to true
    self.initialized = true;

    // Resolve
    return resolve(self);
  });
};

Usage.prototype.validate = function (path, options) {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;

    options = options || {};
    options.useCaptchaResponse = typeof options.useCaptchaResponse === 'undefined' ? true : options.useCaptchaResponse;

    // Check for required options
    const period = self.getUsage(path);
    const allowed = self.getLimit(path);

    // Log
    self.log(`Usage.validate(): Checking ${period}/${allowed} for ${path}...`);

    // If they are under the limit, resolve
    if (period < allowed) {
      self.log(`Usage.validate(): Valid for ${path}`);

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
          assistant.errorify(`Captcha verification failed.`, {code: 400, sentry: false, send: false, log: false})
        );
      }
    }

    // Otherwise, they are over the limit, reject
    return reject(
      assistant.errorify(`You have exceeded your ${path} usage limit of ${period}/${allowed}.`, {code: 429, sentry: false, send: false, log: false})
    );
  });
};

Usage.prototype.increment = function (path, value, options) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  value = value || 1;

  options = options || {};
  options.id = options.id || null;

  // Update total and period
  ['total', 'period', 'last'].forEach((key) => {
    const resolved = `usage.${path}.${key}`;
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
  self.log(`Usage.init(): Incremented ${path} for user`, self.user);

  return self;
};

Usage.prototype.set = function (path, value) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  // Update total and period
  const resolved = `usage.${path}.period`;

  value = value || 0;

  // Set the value
  _.set(self.user, resolved, value);

  // Log the updated user
  self.log(`Usage.init(): Set ${path} for user`, self.user);

  return self;
};

Usage.prototype.getUsage = function (path) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  if (path) {
    return _.get(self.user, `usage.${path}.period`, 0);
  } else {
    return self.user.usage;
  }
};

Usage.prototype.getLimit = function (path) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;

  const key = `products.${self.options.app}-${self.user.plan.id}.limits`;

  if (path) {
    return _.get(self.app, `${key}.${path}`, 0);
  } else {
    return _.get(self.app, key, {});
  }
};

Usage.prototype.update = function () {
  const self = this;

  return new Promise(async function(resolve, reject) {
    const Manager = self.Manager;
    const assistant = self.assistant;

    // Write self.user to firestore or local if no user or if key is set
    if (self.useUnauthenticatedStorage) {
      if (self.options.unauthenticatedMode === 'firestore') {
        Manager.libraries.admin.firestore().doc(`temporary/usage`)
          .set({
            [`${self.key}`]: self.user.usage,
          }, {merge: true})
          .then(() => {
            self.log(`Usage.update(): Updated user.usage in firestore`, self.user.usage);

            return resolve(self.user.usage);
          })
          .catch(e => {
            return reject(assistant.errorify(e, {sentry: true, send: false, log: false}));
          });
      } else {
        self.storage.set(`${self.paths.user}.usage`, self.user.usage).write();

        self.log(`Usage.update(): Updated user.usage in local storage`, self.user.usage);

        return resolve(self.user.usage);
      }
    } else {
      Manager.libraries.admin.firestore().doc(`users/${self.user.auth.uid}`)
        .set({
          usage: self.user.usage,
        }, {merge: true})
        .then(() => {
          self.log(`Usage.update(): Updated user.usage in firestore`, self.user.usage);

          return resolve(self.user.usage);
        })
        .catch(e => {
          return reject(assistant.errorify(e, {sentry: true, send: false, log: false}));
        });
    }
  });
};

Usage.prototype.log = function () {
  const self = this;

  // Log
  if (self.options.log) {
    self.assistant.log(...arguments);
  }
};

module.exports = Usage;
