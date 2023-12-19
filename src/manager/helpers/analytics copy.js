// const ua = require('universal-analytics');
const get = require('lodash/get');
const fetch = require('wonderful-fetch');

const uuidRegex = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/;
let uuidv5;

const BLACKLISTED_USER_AGENTS = new RegExp([
  /(node-fetch)/,
].map(r => r.source).join(''));

function Analytics(Manager, options) {
  let self = this;
  self.Manager = Manager;
  // self._request = self.Manager._inner || {};

  // Set id and secret
  // const analyticsId = get(self.Manager, 'config.google_analytics.id', undefined);
  self.analyticsId = self?.Manager?.config?.google_analytics?.id;
  self.analyticsSecret = self?.Manager?.config?.google_analytics?.secret;

  // Fix options
  options = options || {};

  // Set properties
  self._assistant = options.assistant || Manager.Assistant();
  self._request = {
    ip: get(self._assistant, 'request.geolocation.ip', '127.0.0.1'),
    country: get(self._assistant, 'request.geolocation.country', ''),
    referrer: get(self._assistant, 'request.referrer', ''),
    userAgent: get(self._assistant, 'request.client.userAgent', ''),
    name: get(self._assistant, 'meta.name', ''),
  }

  self._request.userAgent = self._request.userAgent.match(BLACKLISTED_USER_AGENTS) ? '' : self._request.userAgent;

  self._ds = 'app';
  self._uuid = options.uuid || self._request.ip || self.Manager.SERVER_UUID;
  self._uuid = self._uuid.match(uuidRegex) ? self._uuid : self.generateId(self._uuid);
  self._debug = typeof options.debug === 'undefined' ? (self.Manager.assistant.meta.environment === 'development') : options.debug;
  self._pageview = typeof options.pageview === 'undefined' ? true : options.pageview;
  self._version = self.Manager.package.version;
  self._initialized = false;

  if (!self.analyticsId) {
    console.log('Not initializing because missing analyticsId', self.analyticsId);
    return self;
  } else if (!self.analyticsSecret) {
    console.log('Not initializing because missing analyticsSecret', self.analyticsSecret);
    return self;
  }

  // self.user = ua(self.analyticsId, self._uuid, {
  //   strictCidFormat: false, // https://analytics.google.com/analytics/web/#/report-home/a104885300w228822596p215709578
  // });
  // self.user.set('ds', 'app');

  // // https://developers.google.com/analytics/devguides/collection/protocol/v1/parameters#sc
  // if (self._uuid) {
  //   self.user.set('uid', self._uuid);
  // }
  // if (self._request.ip) {
  //   self.user.set('uip', encodeURIComponent(self._request.ip));
  // }
  // if (self._request.userAgent) {
  //   self.user.set('ua', encodeURIComponent(self._request.userAgent));
  // }
  // if (self._request.referrer) {
  //   self.user.set('dr', encodeURIComponent(self._request.referrer));
  // }

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
    return self;
  }

  // self.user.pageview({
  //   dp: options.path,
  //   dl: options.location,
  //   dh: options.host,
  //   dt: options.title,
  // }).send();

  self.send();

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
    return self;
  } else if (self._debug) {
    console.log('Skipping Analytics.event() because in development', self._uuid, options);
    return self;
  }

  // self.user.event({
  //   ec: options.category,
  //   ea: options.action,
  //   el: options.label,
  //   ev: options.value,
  //   // dp: options.path || window.location.href,
  // }).send();

  self.send({
    name: 'tutorial_begin',
    params: {
      campaign_id: 'google_1234',
      campaign: 'Summer_fun',
      source: 'google',
      medium: 'cpc',
      term: 'summer+travel',
      content: 'logolink',
      session_id: '123',
      engagement_time_msec: '100',
    }
  });

  return self;
};

Analytics.prototype.send = function (event) {
  let self = this;

  if (!self._initialized) {
    return self;
  } else if (self._debug) {
    console.log('Skipping Analytics.event() because in development', self._uuid, options);
    return self;
  }

  // self.user = ua(self.analyticsId, self._uuid, {
  //   strictCidFormat: false, // https://analytics.google.com/analytics/web/#/report-home/a104885300w228822596p215709578
  // });
  // self.user.set('ds', 'app');

  // // https://developers.google.com/analytics/devguides/collection/protocol/v1/parameters#sc
  // if (self._uuid) {
  //   self.user.set('uid', self._uuid);
  // }
  // if (self._request.ip) {
  //   self.user.set('uip', encodeURIComponent(self._request.ip));
  // }
  // if (self._request.userAgent) {
  //   self.user.set('ua', encodeURIComponent(self._request.userAgent));
  // }
  // if (self._request.referrer) {
  //   self.user.set('dr', encodeURIComponent(self._request.referrer));
  // }

  /*
    https://stackoverflow.com/questions/68773179/what-should-the-client-id-be-when-sending-events-to-google-analytics-4-using-the
    https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=gtag


  */

  // Send event
  fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${self.analyticsId}&api_secret=${self.analyticsSecret}`, {
    method: 'post',
    body: {
      client_id: self._uuid,
      user_id: self._uuid,
      events: [event],
    },
  })
  .then((r) => {
    console.log('Analytics.send(): Sent', r);
  })
  .catch((e) => {
    console.error('Analytics.send(): Error sending', e);
  });

  return self;
};

module.exports = Analytics;
