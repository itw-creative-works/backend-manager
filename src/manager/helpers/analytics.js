const fetch = require('wonderful-fetch');
const moment = require('moment');
const crypto = require('crypto');
let uuidv5;

const UUID_REGEX = /[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}/;
const BLOCKED_USER_AGENTS = [
  /(node-fetch)/ig,
];

function Analytics(Manager, options) {
  const self = this;

  // Set initialized
  self.initialized = false;

  // Fix options
  options = options || {};

  // Set properties
  self.Manager = Manager;
  self.assistant = options?.assistant || Manager.Assistant();

  // Set request properties
  self.request = {
    ip: self.assistant?.request?.geolocation?.ip || null,
    country: self.assistant?.request?.geolocation?.country || null,
    city: self.assistant?.request?.geolocation?.city || null,
    region: self.assistant?.request?.geolocation?.region || null,
    referrer: self.assistant?.request?.referrer || null,
    userAgent: self.assistant?.request?.client?.userAgent || null,
    language: (self.assistant?.request?.client?.language || '').split(',')[0] || null,
    mobile: self.assistant?.request?.client?.mobile || false,
    platform: self.assistant?.request?.client?.platform || null,
    name: self.assistant?.meta?.name || '',
  }

  // Remove blacklisted user agents
  self.request.userAgent = self.request.userAgent && BLOCKED_USER_AGENTS.some((regex) => self.request.userAgent.match(regex))
    ? null
    : self.request.userAgent;

  // Fix options
  options.dataSource = options.dataSource || 'server';
  options.uuid = options.uuid || self.request.ip || Manager.SERVER_UUID;
  options.isDevelopment = typeof options.isDevelopment === 'undefined' ? self.assistant.isDevelopment() : options.isDevelopment;
  options.pageview = typeof options.pageview === 'undefined' ? true : options.pageview;
  options.version = options.version || Manager.package.version;
  options.userProperties = options.userProperties || {};
  options.userData = options.userData || {};

  // Set user
  // https://www.optimizesmart.com/how-to-create-and-use-user-properties-in-ga4/
  // https://developers.google.com/analytics/devguides/collection/protocol/ga4/user-properties?client_type=gtag
  // https://support.google.com/analytics/answer/12980150?hl=en&co=GENIE.Platform%3DAndroid
  const authUser = self.assistant?.usage?.user;
  self.userProperties = {
    app_version: {
      value: options.version,
    },
    // browser: {
    //   value: self.request.userAgent,
    // },
    device_category: {
      value: self.request.mobile ? 'mobile' : 'desktop',
    },
    // device_model: {
    //   value: 'None',
    // },
    operating_system: {
      value: self.request.platform,
    },
    // os_version: {
    //   value: 'None',
    // },
    // os_with_version: {
    //   value: 'None',
    // },
    platform: {
      value: 'web',
    },
    // screen_resolution: {
    //   value: 'None',
    // },
    age: {
      value: authUser?.personal?.birthday?.timestampUNIX
        ? new Date().getFullYear() - new Date(authUser?.personal?.birthday?.timestampUNIX).getFullYear()
        : 'None',
    },
    country: {
      value: self.request.country,
    },
    city: {
      value: self.request.city,
    },
    gender: {
      value: authUser?.personal?.gender
        ? authUser?.personal?.gender
        : 'None',
    },
    // interests: {
    //   value: 'None',
    // },
    language: {
      value: self.request.language,
    },

    // TODO
    // Add custom events for user properties, like plan ID, etc, draw from self.assistant.usage, etc
    authenticated: {
      value: authUser?.auth?.uid ? true : false,
    },
    subscription_id: {
      value: authUser?.subscription?.product?.id || 'basic',
    },
    subscription_trial_activated: {
      value: authUser?.subscription?.trial?.activated || false,
    },
    activity_created: {
      value: moment(authUser?.activity?.created?.timestampUNIX
        ? authUser?.activity?.created?.timestamp
        : self.assistant.meta.startTime.timestamp).format('YYYY-MM-DD'),
    },

    // ds? 'app
    // uid?
    // uip?
    // ua?
    // dr? (referrer)
  };

  // Fix user data
  // https://developers.google.com/analytics/devguides/collection/ga4/uid-data
  // https://stackoverflow.com/questions/68636233/ga4-measurement-protocol-does-not-display-user-data-location-screen-resolution
  self.userData = {
    sha256_email_address: authUser?.auth?.email
      ? toSHA256(authUser?.auth?.email)
      : undefined,
    sha256_phone_number: authUser?.personal?.telephone?.number
      ? toSHA256(authUser?.personal?.telephone?.countryCode + authUser?.personal?.telephone?.number)
      : undefined,
    address: {
      sha256_first_name: authUser?.personal?.name?.first
        ? toSHA256(authUser?.personal?.name?.first)
        : undefined,
      sha256_last_name: authUser?.personal?.name?.last
        ? toSHA256(authUser?.personal?.name?.last)
        : undefined,
      // sha256_street: TODO,
      city: self.request.city || undefined,
      region: self.request.region || undefined,
      // postal_code: TODO,
      country: self.request.country || undefined,
    }
  }

  // Merge user properties
  self.userProperties = {
    ...self.userProperties,
    ...options.userProperties,
  };

  // Set id and secret
  self.analyticsId = self?.Manager?.config?.google_analytics?.id;
  self.analyticsSecret = self?.Manager?.config?.google_analytics?.secret;

  // Check if we have the required properties
  if (!self.analyticsId) {
    self.assistant.log('analytics(): Not initializing because missing analyticsId', self.analyticsId);
    return self;
  } else if (!self.analyticsSecret) {
    self.assistant.log('analytics(): Not initializing because missing analyticsSecret', self.analyticsSecret);
    return self;
  }

  // Automatically convert the supplied uuid to a valid uuid (in case the user supplies something else like an IP or email)
  options.uuid = options.uuid.match(UUID_REGEX)
    ? options.uuid
    : self.generateId(options.uuid);

  // Attach options
  self.options = options;

  // Set initialized
  self.initialized = true;

  // Send pageview if enabled
  // .. Removed

  // Return
  return self;
}

Analytics.prototype.generateId = function (id) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const options = self.options;
  const request = self.request;
  const userProperties = self.userProperties;
  const userData = self.userData;

  // Load uuidv5
  uuidv5 = uuidv5 || require('uuid').v5;

  // Get namespace
  const namespace = process.env.BACKEND_MANAGER_NAMESPACE || undefined;

  // Generate id
  return id && namespace
    ? uuidv5(id, namespace)
    : undefined;
};

Analytics.prototype.event = function (payload, params) {
  const self = this;
  const Manager = self.Manager;
  const assistant = self.assistant;
  const options = self.options;
  const request = self.request;
  const userProperties = self.userProperties;
  const userData = self.userData;

  // Fix payload
  // https://support.google.com/analytics/answer/13316687?hl=en#zippy=%2Cweb
  // https://support.google.com/analytics/answer/9268042?sjid=4476481583372132143-NC
  // https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference/events#screen_view
  // Support both: event({ name, params }) and event('name', params)
  if (typeof payload === 'string') {
    payload = { name: payload, params: params || {} };
  }
  payload = payload || {};

  // Fix event name
  payload.name = `${payload.name}`
    // Replace anything not a letter, number, or underscore with an underscore
    .replace(/[^a-zA-Z0-9_]/g, '_')
    // Remove leading and trailing underscores
    .replace(/^_+|_+$/g, '')
    // Remove multiple underscores
    .replace(/_+/g, '_');

  // Fix event params
  payload.params = payload.params || {};

  // Check if initialized
  if (!self.initialized) {
    return self;
  } else if (options.isDevelopment) {
    assistant.log('analytics().event(): Skipping because in development', options.uuid, JSON.stringify(payload));
    return self;
  }

  // https://stackoverflow.com/questions/71871458/how-to-send-user-properties-to-measurement-protocol-google-analytics-4

  // USer properties
  // https://developers.google.com/analytics/devguides/collection/protocol/ga4/user-properties?client_type=gtag

  // raw
  // https://stackoverflow.com/questions/69105735/google-analytics-4-measurement-protocol-api-used-without-gtag-js-or-firebase

  // Fix payload
  payload.params.event_source = options.dataSource;
  payload.params.page_location = request.name; // Supposed to be domain
  // payload.params.page_location = `${INSERT DOMAIN HERE}${request.name}`; // Supposed to be domain
  payload.params.page_title = request.name; // Supposed to be title
  payload.params.ip_override = request.ip;
  payload.params.user_agent = request.userAgent;
  payload.params.page_referrer = request.referrer;
  // https://stackoverflow.com/questions/70708893/google-analytics-4-measurement-protocol-shows-events-but-no-users/71811327#71811327
  payload.params.engagement_time_msec = new Date().getTime() - new Date(assistant.meta.startTime.timestamp).getTime();
  // payload.params.engagement_time_msec = 1;
  payload.params.debug_mode = false;
  payload.params.session_id = assistant.id;
  // payload.params.campaign = 'your_campaign';
  // payload.params.source = 'your_source';
  // payload.params.medium = 'your_medium';
  // payload.params.term = 'your_term';
  // payload.params.content = 'your_content';


  // https://stackoverflow.com/questions/75998626/city-is-not-populating-in-ga4-measurement-protocol-api
  // {
  //     "client_id": "6909975079.1681323722",
  //     "events": [
  //         {
  //             "name": "page_view",
  //             "params": {
  //                 "page_title": "Wedding: QR Code",
  //                 "hostname": "scan.example.com",
  //                 "landing_page": "/eRCU",
  //                 "page_location": "https://scan.example.com/eRCU",
  //                 "page_referrer": "https://scan.example.com/eRCU",
  //                 "city": "Mumbai",
  //                 "continent_code": "AS",
  //                 "country_code": "IN",
  //                 "country": "India",
  //                 "latitude": "19.0748",
  //                 "longitude": "72.8856",
  //                 "session_id": 1681313623,
  //                 "engagement_time_msec": 264,
  //                 "ip_address": "XX.36.XXX.14"
  //             }
  //         }
  //     ]
  // }

  // Build url and body
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${self.analyticsId}&api_secret=${self.analyticsSecret}`;
  const body = {
    client_id: self.options.uuid,
    user_id: self.options.uuid,
    // timestamp_micros: new Date().getTime() * 1000,
    user_properties: userProperties,
    user_data: userData,
    // consent: {},
    // non_personalized_ads: false,
    events: [payload],
  }

  // Log full payload
  if (assistant.isDevelopment()) {
    assistant.log('analytics().event(): Sending...', url, JSON.stringify(body));
  }

  // Send event
  fetch(url, {
    method: 'post',
    response: 'text',
    tries: 2,
    timeout: 30000,
    // headers: {
    //   "Content-Type": "application/json"
    // },
    body: body,
  })
  .then((r) => {
    if (assistant.isDevelopment()) {
      assistant.log('analytics().event(): Success', r);
    }
  })
  .catch((e) => {
    assistant.error('analytics().event(): Failed', e);
  });

  // Return
  return self;
};




// Analytics.prototype.send = function (event) {
//   const self = this;

//   // Check if initialized
//   if (!self.initialized) {
//     return self;
//   } else if (self.options.isDevelopment) {
//     assistant.log('analytics(): Skipping Analytics.event() because in development', self.options.uuid, event);
//     return self;
//   }

//   /*
//     https://stackoverflow.com/questions/68773179/what-should-the-client-id-be-when-sending-events-to-google-analytics-4-using-the
//     https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=gtag


//     https://developers.google.com/analytics/devguides/collection/protocol/v1/parameters#sc
//     https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=gtag#recommended_parameters_for_reports
//     https://stackoverflow.com/questions/43049662/how-to-send-measurement-protocol-if-there-is-no-clientid

//     https://developers.google.com/analytics/devguides/collection/protocol/ga4/validating-events?client_type=gtag
//     https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference?client_type=gtag
//     https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference/events
//     https://developers.google.com/analytics/devguides/collection/protocol/ga4/ua-feature-matrix
//   */


//  /*

//   */

//   // Format event
//   // event = event || {};
//   // event.name = event.name || '';
//   // event.params = event.params || {};
//   // event.params.engagement_time_msec = `${new Date().getTime() - new Date(self.assistant.meta.startTime.timestamp).getTime()}`;
//   // event.params.event_source = self.options.dataSource;
//   // event.params.ip_override = self.request.ip;
//   // event.params.user_agent = self.request.userAgent;
//   // event.params.page_location = self.request.name;
//   // event.params.page_referrer = self.request.referrer;
//   // event.params.page_title = self.request.name;

//   event = event || {};
//   event.name = event.name || '';
//   event.params = event.params || {};
//   // event.params.session_id = self.assistant.id;
//   // event.params.engagement_time_msec = `${new Date().getTime() - new Date(self.assistant.meta.startTime.timestamp).getTime()}`;
//   // event.params.event_source = self.options.dataSource;
//   // event.params.ip_override = self.request.ip;
//   // event.params.user_agent = self.request.userAgent;
//   // event.params.page_location = self.request.name;
//   // event.params.page_referrer = self.request.referrer;
//   // event.params.page_title = self.request.name;

//   // "event_source": "server",
//   // "page_location": "https:\/\/www.yourdomain.com\/page2",
//   // "page_referrer": "\/page1",
//   // "page_title": "Page 2",
//   // "ip_override": "xxx.xxx.xxx.0",
//   // "campaign": "your_campaign",
//   // "source": "your_source",
//   // "medium": "your_medium",
//   // "term": "your_term",
//   // "content": "your_content"

//   const url = `https://www.google-analytics.com/mp/collect?measurement_id=${self.analyticsId}&api_secret=${self.analyticsSecret}`;
//   const body = {
//     client_id: self.options.uuid,
//     user_id: self.options.uuid,
//     // timestamp_micros: new Date().getTime() * 1000,
//     user_properties: {},
//     // consent: {},
//     // non_personalized_ads: false,
//     events: [event],
//   }

//   // Log
//   if (self.assistant.isDevelopment()) {
//     assistant.log('analytics().send(): Sending...', url, JSON.stringify(body));
//   }

//   // Send event
//   fetch(url, {
//   // fetch(`https://www.google-analytics.com/debug/mp/collect?measurement_id=${self.analyticsId}&api_secret=${self.analyticsSecret}`, {
//     method: 'post',
//     response: 'text',
//     tries: 2,
//     timeout: 30000,
//     // headers: {
//     //   "Content-Type": "application/json"
//     // },
//     body: body,
//   })
//   .then((r) => {
//     if (self.assistant.isDevelopment()) {
//       assistant.log('analytics().send(): Success', r);
//     }
//   })
//   .catch((e) => {
//     self.assistant.error('analytics().send(): Failed', e);
//   });

//   return self;
// };

/*
Unlike gtag, which automatically hashes sensitive user-provided data, the Measurement Protocol requires a developer to hash sensitive user-provided data using a secure one-way hashing algorithm called SHA256 and encode it using hex string format prior to calling the API.

All user data fields starting with the sha256 prefix in their name should be only populated with hashed and hex-encoded values.

The following example code performs the necessary encryption and encoding steps:
*/

function toSHA256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = Analytics;
