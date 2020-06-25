const ua = require('universal-analytics');
const get = require('lodash/get');
const uuidRegex = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/;
let uuidv5;

function Analytics(Manager, options) {
  let self = this;
  self.Manager = Manager;
  let analyticsId = get(self.Manager, 'config.google_analytics.id', undefined);

  options = options || {};
  self.uuid = options.uuid && options.uuid.match(uuidRegex) ? options.uuid : self.generateId(options.uuid);
  self.initialized = false;

  if (!analyticsId) {
    console.log('Not initializing becuase missing', analyticsId);
    return self;
  }

  self.user = ua(analyticsId, self.uuid, {
    strictCidFormat: false,
    // country: 'Russia',
  }); // https://analytics.google.com/analytics/web/#/report-home/a104885300w228822596p215709578
  if (self.uuid) {
    self.user.set('uid', self.uuid);
  }
  // self.user.set('country', 'Russia');
  self.user.set('ds', 'app');

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
