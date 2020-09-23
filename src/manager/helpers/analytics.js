const ua = require('universal-analytics');
const get = require('lodash/get');
const uuidRegex = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/;
let uuidv5;

function Analytics(Manager, options) {
  let self = this;
  self.Manager = Manager;
  const analyticsId = get(self.Manager, 'config.google_analytics.id', undefined);
  const request = self.Manager._inner || {};

  options = options || {};
  self.uuid = options.uuid || request.ip || self.Manager.SERVER_UUID;
  self.uuid = self.uuid.match(uuidRegex) ? self.uuid : self.generateId(self.uuid);
  self.initialized = false;

  if (!analyticsId) {
    console.log('Not initializing because missing analyticsId', analyticsId);
    return self;
  }

  self.user = ua(analyticsId, self.uuid, {
    strictCidFormat: false, // https://analytics.google.com/analytics/web/#/report-home/a104885300w228822596p215709578
  });
  self.user.set('ds', 'app');

  // https://developers.google.com/analytics/devguides/collection/protocol/v1/parameters#sc
  if (self.uuid) {
    self.user.set('uid', self.uuid);
  }
  if (request.ip) {
    self.user.set('uip', request.ip);
  }
  if (request.country) {
    self.user.set('geoid', request.country);
  }
  if (request.userAgent) {
    self.user.set('ua', request.userAgent);
  }
  if (request.referrer) {
    self.user.set('dr', request.referrer);
  }

  self.version = self.Manager.package.version;

  self.initialized = true;
  return self;
}

Analytics.prototype.generateId = function (id) {
  let self = this;
  uuidv5 = uuidv5 || require('uuid').v5;
  let namespace = get(self.Manager, 'config.backend_manager.namespace', undefined);

  return id && namespace ? uuidv5(id, namespace) : undefined;
};

Analytics.prototype.event = function (options) {
  let self = this;
  options = options || {};

  if (!self.initialized) {
    return this;
  } else if (self.Manager.assistant.meta.environment === 'development') {
    console.log('Skipping Analytics.event() because in development', self.uuid, options);
    return this;
  }

  self.user.event({
    ec: options.category,
    ea: options.action,
    el: options.label,
    ev: options.value,
    // dp: options.path || window.location.href,
  }).send();

  return this;
};

module.exports = Analytics;
