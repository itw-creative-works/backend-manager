const ua = require('universal-analytics');
const get = require('lodash/get');
const uuidRegex = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/;
let uuidv5;

function Analytics(Manager, options) {
  let self = this;
  self.Manager = Manager;
  // self._request = self.Manager._inner || {};

  const analyticsId = get(self.Manager, 'config.google_analytics.id', undefined);

  // Fix optios
  options = options || {};

  // Set properties
  self._assistant = options.assistant || Manager.Assistant();
  self._request = {
    ip: get(assistant, 'request.ip', '127.0.0.1'),
    country: get(assistant, 'request.country', ''),
    referrer: get(assistant, 'request.referrer', ''),
    userAgent: get(assistant, 'request.userAgent', ''),
    name: get(assistant, 'meta.name', ''),
  }

  self._uuid = options.uuid || self._request.ip || self.Manager.SERVER_UUID;
  self._uuid = self._uuid.match(uuidRegex) ? self._uuid : self.generateId(self._uuid);
  self._debug = typeof options.debug === 'undefined' ? (self.Manager.assistant.meta.environment === 'development') : options.debug;
  self._pageview = typeof options.pageview === 'undefined' ? true : options.pageview;
  self._version = self.Manager.package.version;
  self._initialized = false;

  if (!analyticsId) {
    console.log('Not initializing because missing analyticsId', analyticsId);
    return self;
  }

  self.user = ua(analyticsId, self._uuid, {
    strictCidFormat: false, // https://analytics.google.com/analytics/web/#/report-home/a104885300w228822596p215709578
  });
  self.user.set('ds', 'app');

  // https://developers.google.com/analytics/devguides/collection/protocol/v1/parameters#sc
  if (self._uuid) {
    self.user.set('uid', self._uuid);
  }
  if (self._request.ip) {
    self.user.set('uip', encodeURIComponent(self._request.ip));
  }
  if (self._request.userAgent) {
    self.user.set('ua', encodeURIComponent(self._request.userAgent));
  }
  if (self._request.referrer) {
    self.user.set('dr', encodeURIComponent(self._request.referrer));
  }

  self._initialized = true;

  if (self._pageview) {
    self.pageview({
      path: self._request.name,
      location: self._request.name,
      host: self._request.name,
      title: self._request.name,
    })
  }

  return self;
}

Analytics.prototype.generateId = function (id) {
  let self = this;
  uuidv5 = uuidv5 || require('uuid').v5;
  let namespace = get(self.Manager, 'config.backend_manager.namespace', undefined);

  return id && namespace ? uuidv5(id, namespace) : undefined;
};

Analytics.prototype.pageview = function (options) {
  let self = this;
  options = options || {};
  options.path = options.path || self._request.name;
  options.location = options.location || self._request.name;
  options.host = options.host || self._request.name;
  options.title = options.title || self._request.name;

  if (!self._initialized) {
    return self;
  } else if (self._debug) {
    console.log('Skipping Analytics.pageview() because in development', self._uuid, options);
  }

  self.user.pageview({
    dp: options.path,
    dl: options.location,
    dh: options.host,
    dt: options.title,
  }).send();

  return self;
};

Analytics.prototype.event = function (options) {
  let self = this;
  options = options || {};
  options.category = options.category;
  options.action = options.action;
  options.label = options.label;
  options.value = options.value;
  options.path = options.path || self._request.name;

  if (!self._initialized) {
    return this;
  } else if (self._debug) {
    console.log('Skipping Analytics.event() because in development', self._uuid, options);
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
