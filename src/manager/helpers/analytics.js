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
  self.debug = typeof options.debug === 'undefined' ? (self.Manager.assistant.meta.environment === 'development') : options.debug;
  self.pageview = typeof options.pageview === 'undefined' ? true : options.pageview;
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
    // self.user.set('uip', encodeURIComponent('103.113.3.242' || request.ip));
    self.user.set('uip', encodeURIComponent(request.ip));
  }
  // Disabled this 10/8/2020 because uip provides more accurate locationing
  // if (request.country) {
  //   self.user.set('geoid', request.country);
  // }
  if (request.userAgent) {
    // self.user.set('ua', encodeURIComponent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.80 Safari/537.36' || request.userAgent));
    self.user.set('ua', encodeURIComponent(request.userAgent));
  }
  if (request.referrer) {
    // self.user.set('dr', encodeURIComponent('https://test.com' || request.referrer));
    self.user.set('dr', encodeURIComponent(request.referrer));
  }

  if (self.pageview) {
    self.user.pageview({
      dp: request.name,
      // dl: 'https://test.com',
      dh: request.name,
      dt: request.name,
    }).send();
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
  } else if (self.debug) {
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

  return self;
};

module.exports = Analytics;
