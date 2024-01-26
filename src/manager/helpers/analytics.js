// const ua = require('universal-analytics');
const get = require('lodash/get');
const fetch = require('wonderful-fetch');

const uuidRegex = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/;
let uuidv5;

const BLACKLISTED_USER_AGENTS = new RegExp([
  /(node-fetch)/,
].map(r => r.source).join(''));

function Analytics(Manager, options) {
  const self = this;
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

  self._data_soruce = 'server';
  self._uuid = options.uuid || self._request.ip || self.Manager.SERVER_UUID;
  self._uuid = self._uuid.match(uuidRegex) ? self._uuid : self.generateId(self._uuid);
  self._debug = typeof options.debug === 'undefined' ? self._assistant.isDevelopment() : options.debug;
  self._pageview = typeof options.pageview === 'undefined' ? true : options.pageview;
  self._version = self.Manager.package.version;
  self._initialized = false;

  if (!self.analyticsId) {
    self._assistant.log('analytics(): Not initializing because missing analyticsId', self.analyticsId);
    return self;
  } else if (!self.analyticsSecret) {
    self._assistant.log('analytics(): Not initializing because missing analyticsSecret', self.analyticsSecret);
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
  const self = this;
  uuidv5 = uuidv5 || require('uuid').v5;
  let namespace = get(self.Manager, 'config.backend_manager.namespace', undefined);

  return id && namespace ? uuidv5(id, namespace) : undefined;
};

// Disabled because we are using the Measurement Protocol (12/19/2023)
Analytics.prototype.pageview = function (options) {
  // const self = this;
  // options = options || {};
  // options.path = options.path || self._request.name;
  // options.location = options.location || self._request.name;
  // options.host = options.host || self._request.name;
  // options.title = options.title || self._request.name;

  // if (!self._initialized) {
  //   return self;
  // } else if (self._debug) {
  //   self._assistant.log('analytics(): Skipping Analytics.pageview() because in development', self._uuid, options);
  //   return self;
  // }

  // // self.user.pageview({
  // //   dp: options.path,
  // //   dl: options.location,
  // //   dh: options.host,
  // //   dt: options.title,
  // // }).send();

  // // self.send();

  // return self;
};

Analytics.prototype.event = function (options) {
  const self = this;

  // Fix options
  options = options || {};

  if (!self._initialized) {
    return self;
  } else if (self._debug) {
    self._assistant.log('analytics(): Skipping Analytics.event() because in development', self._uuid, options);
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
    name: options.name,
    params: options.params
  });

  return self;
};

Analytics.prototype.send = function (event) {
  const self = this;

  if (!self._initialized) {
    return self;
  } else if (self._debug) {
    self._assistant.log('analytics(): Skipping Analytics.event() because in development', self._uuid, event);
    return self;
  }

  /*
    https://stackoverflow.com/questions/68773179/what-should-the-client-id-be-when-sending-events-to-google-analytics-4-using-the
    https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=gtag


    https://developers.google.com/analytics/devguides/collection/protocol/v1/parameters#sc
    https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=gtag#recommended_parameters_for_reports
    https://stackoverflow.com/questions/43049662/how-to-send-measurement-protocol-if-there-is-no-clientid

    https://developers.google.com/analytics/devguides/collection/protocol/ga4/validating-events?client_type=gtag
    https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference?client_type=gtag
    https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference/events
    https://developers.google.com/analytics/devguides/collection/protocol/ga4/ua-feature-matrix
  */

  // Format event
  event = event || {};
  event.name = event.name || '';
  event.timestamp_micros = new Date().getTime() * 1000,
  event.params = event.params || {};
  event.params.session_id = self._assistant.id;
  event.params.engagement_time_msec = `${new Date().getTime() - new Date(self._assistant.meta.startTime.timestamp).getTime()}`;
  event.params.event_source = self._data_soruce;
  event.params.ip_override = self._request.ip;
  event.params.user_agent = self._request.userAgent;
  event.params.page_location = self._request.name;
  event.params.page_referrer = self._request.referrer;
  event.params.page_title = self._request.name;

  // "event_source": "server",
  // "page_location": "https:\/\/www.yourdomain.com\/page2",
  // "page_referrer": "\/page1",
  // "page_title": "Page 2",
  // "ip_override": "xxx.xxx.xxx.0",
  // "campaign": "your_campaign",
  // "source": "your_source",
  // "medium": "your_medium",
  // "term": "your_term",
  // "content": "your_content"

  const body = {
    client_id: self._uuid,
    user_id: self._uuid,
    // ip_override: self._request.ip,
    // user_agent: self._request.userAgent,
    events: [event],
  }

  // Log
  if (self._assistant.isDevelopment()) {
    self._assistant.log('analytics().send(): Sending...', JSON.stringify(body));
  }

  // Send event
  fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${self.analyticsId}&api_secret=${self.analyticsSecret}`, {
  // fetch(`https://www.google-analytics.com/debug/mp/collect?measurement_id=${self.analyticsId}&api_secret=${self.analyticsSecret}`, {
    method: 'post',
    response: 'text',
    tries: 2,
    timeout: 30000,
    body: body,
  })
  .then((r) => {
    if (self._assistant.isDevelopment()) {
      self._assistant.log('analytics().send(): Success', r);
    }
  })
  .catch((e) => {
    self._assistant.error('analytics().send(): Failed', e);
  });

  return self;
};

module.exports = Analytics;
