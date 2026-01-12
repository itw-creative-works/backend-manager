const _ = require('lodash');
const uuid4 = require('uuid').v4;
const shortid = require('shortid');
const powertools = require('node-powertools');
const UIDGenerator = require('uid-generator');
const uidgen = new UIDGenerator(256);

/**
 * Helper: returns value if defined, otherwise returns defaultValue (if useDefaults=true) or null
 * @param {*} value - The value to check
 * @param {*} defaultValue - The default value to use if value is null/undefined
 * @param {boolean} useDefaults - Whether to use defaultValue or return null
 * @returns {*}
 */
function getWithDefault(value, defaultValue, useDefaults) {
  return value ?? (useDefaults ? defaultValue : null);
}

function User(Manager, settings, options) {
  const self = this;

  self.Manager = Manager;

  settings = settings || {};
  options = options || {};

  options.defaults = typeof options.defaults === 'undefined' ? true : options.defaults;
  options.prune = typeof options.prune === 'undefined' ? false : options.prune;

  const now = powertools.timestamp(new Date(), {output: 'string'});
  const nowUNIX = powertools.timestamp(now, {output: 'unix'});
  const oldDate = powertools.timestamp(new Date(0), {output: 'string'})
  const oldDateUNIX = powertools.timestamp(oldDate, {output: 'unix'});

  const defaults = options.defaults;

  self.properties = {
    auth: {
      uid: settings?.auth?.uid ?? null,
      email: settings?.auth?.email ?? null,
      temporary: getWithDefault(settings?.auth?.temporary, false, defaults),
    },
    plan: {
      id: getWithDefault(settings?.plan?.id, 'basic', defaults), // intro | basic | advanced | premium
      status: getWithDefault(settings?.plan?.status, 'cancelled', defaults), // active | suspended | cancelled
      expires: {
        timestamp: getWithDefault(settings?.plan?.expires?.timestamp, oldDate, defaults),
        timestampUNIX: getWithDefault(settings?.plan?.expires?.timestampUNIX, oldDateUNIX, defaults),
      },
      trial: {
        activated: getWithDefault(settings?.plan?.trial?.activated, false, defaults),
        expires: {
          timestamp: getWithDefault(settings?.plan?.trial?.expires?.timestamp, oldDate, defaults),
          timestampUNIX: getWithDefault(settings?.plan?.trial?.expires?.timestampUNIX, oldDateUNIX, defaults),
        },
      },
      limits: {
        // devices: settings?.plan?.limits?.devices ?? null,
      },
      payment: {
        processor: settings?.plan?.payment?.processor ?? null, // paypal | stripe | chargebee, etc
        orderId: settings?.plan?.payment?.orderId ?? null, // xxx-xxx-xxx
        resourceId: settings?.plan?.payment?.resourceId ?? null, // x-xxxxxx
        frequency: settings?.plan?.payment?.frequency ?? null, // monthly || annually
        active: getWithDefault(settings?.plan?.payment?.active, false, defaults), // true | false
        startDate: {
          timestamp: getWithDefault(settings?.plan?.payment?.startDate?.timestamp, now, defaults), // x-xxxxxx
          timestampUNIX: getWithDefault(settings?.plan?.payment?.startDate?.timestampUNIX, nowUNIX, defaults), // x-xxxxxx
        },
        updatedBy: {
          event: {
            name: settings?.plan?.payment?.updatedBy?.event?.name ?? null, // x-xxxxxx
            id: settings?.plan?.payment?.updatedBy?.event?.id ?? null, // x-xxxxxx
          },
          date: {
            timestamp: getWithDefault(settings?.plan?.payment?.updatedBy?.date?.timestamp, now, defaults), // x-xxxxxx
            timestampUNIX: getWithDefault(settings?.plan?.payment?.updatedBy?.date?.timestampUNIX, nowUNIX, defaults), // x-xxxxxx
          },
        },
      }
    },
    roles: {
      admin: getWithDefault(settings?.roles?.admin, false, defaults),
      betaTester: getWithDefault(settings?.roles?.betaTester, false, defaults),
      developer: getWithDefault(settings?.roles?.developer, false, defaults),
    },
    flags: {
      signupProcessed: getWithDefault(settings?.flags?.signupProcessed, false, defaults),
    },
    affiliate: {
      code: getWithDefault(settings?.affiliate?.code, self.Manager.Utilities().randomId({size: 7}), defaults),
      referrals: settings?.affiliate?.referrals ?? [],
    },
    activity: {
      lastActivity: {
        timestamp: getWithDefault(settings?.activity?.lastActivity?.timestamp, now, defaults),
        timestampUNIX: getWithDefault(settings?.activity?.lastActivity?.timestampUNIX, nowUNIX, defaults),
      },
      created: {
        timestamp: getWithDefault(settings?.activity?.created?.timestamp, now, defaults),
        timestampUNIX: getWithDefault(settings?.activity?.created?.timestampUNIX, nowUNIX, defaults),
      },
      geolocation: {
        ip: getWithDefault(settings?.activity?.geolocation?.ip, '', defaults),
        continent: getWithDefault(settings?.activity?.geolocation?.continent, '', defaults),
        country: getWithDefault(settings?.activity?.geolocation?.country, '', defaults),
        region: getWithDefault(settings?.activity?.geolocation?.region, '', defaults),
        city: getWithDefault(settings?.activity?.geolocation?.city, '', defaults),
        latitude: getWithDefault(settings?.activity?.geolocation?.latitude, 0, defaults),
        longitude: getWithDefault(settings?.activity?.geolocation?.longitude, 0, defaults),
      },
      client: {
        language: getWithDefault(settings?.activity?.client?.language, '', defaults),
        mobile: getWithDefault(settings?.activity?.client?.mobile, false, defaults),
        device: getWithDefault(settings?.activity?.client?.device, '', defaults),
        platform: getWithDefault(settings?.activity?.client?.platform, '', defaults),
        browser: getWithDefault(settings?.activity?.client?.browser, '', defaults),
        vendor: getWithDefault(settings?.activity?.client?.vendor, '', defaults),
        runtime: getWithDefault(settings?.activity?.client?.runtime, '', defaults),
        userAgent: getWithDefault(settings?.activity?.client?.userAgent, '', defaults),
        url: getWithDefault(settings?.activity?.client?.url, '', defaults),
      },
    },
    api: {
      clientId: getWithDefault(settings?.api?.clientId, `${uuid4()}`, defaults),
      privateKey: getWithDefault(settings?.api?.privateKey, `${uidgen.generateSync()}`, defaults),
    },
    usage: {
      requests: {
        period: getWithDefault(settings?.usage?.requests?.period, 0, defaults),
        total: getWithDefault(settings?.usage?.requests?.total, 0, defaults),
        last: {
          id: getWithDefault(settings?.usage?.requests?.last?.id, '', defaults),
          timestamp: getWithDefault(settings?.usage?.requests?.last?.timestamp, oldDate, defaults),
          timestampUNIX: getWithDefault(settings?.usage?.requests?.last?.timestampUNIX, oldDateUNIX, defaults),
        },
      },
    },
    personal: {
      birthday: {
        timestamp: getWithDefault(settings?.personal?.birthday?.timestamp, oldDate, defaults),
        timestampUNIX: getWithDefault(settings?.personal?.birthday?.timestampUNIX, oldDateUNIX, defaults),
      },
      gender: getWithDefault(settings?.personal?.gender, '', defaults),
      location: {
        country: getWithDefault(settings?.personal?.location?.country, '', defaults),
        region: getWithDefault(settings?.personal?.location?.region, '', defaults),
        city: getWithDefault(settings?.personal?.location?.city, '', defaults),
      },
      name: {
        first: getWithDefault(settings?.personal?.name?.first, '', defaults),
        last: getWithDefault(settings?.personal?.name?.last, '', defaults),
      },
      company: {
        name: getWithDefault(settings?.personal?.company?.name, '', defaults),
        position: getWithDefault(settings?.personal?.company?.position, '', defaults),
      },
      telephone: {
        countryCode: getWithDefault(settings?.personal?.telephone?.countryCode, 0, defaults),
        national: getWithDefault(settings?.personal?.telephone?.national, 0, defaults),
      },
    },
    oauth2: {
      // updated: {
      //   timestamp: getWithDefault(settings?.oauth2?.updated?.timestamp, oldDate, defaults),
      //   timestampUNIX: getWithDefault(settings?.oauth2?.updated?.timestampUNIX, oldDateUNIX, defaults),
      // },
    },
  }

  if (options.prune) {
    self.properties = pruneObject(self.properties);
  }

  self.resolve = function (options) {
    options = options || {};
    options.defaultPlan = options.defaultPlan || 'basic';
    const planId = self.properties?.plan?.id ?? options.defaultPlan;
    const premiumExpire = self.properties?.plan?.expires?.timestamp ?? 0;

    let difference = ((new Date(premiumExpire).getTime() - new Date().getTime())/(24*3600*1000));
    // console.log('---difference', difference);
    if (difference <= -1) {
      _.set(self.properties, 'plan.id', options.defaultPlan);
      // console.log('---REVERTED TO BASIC BECAUSE EXPIRED');
    } else {
      // console.log('---ITS FINE');
    }
    return self;
  }

  self.merge = function (userObject) {
    self.properties = _.merge({}, self.properties, userObject)
    return self;
  }

  return self;
}


// https://stackoverflow.com/a/26202058/7305269
function pruneObject(obj) {
  return function prune(current) {
    _.forOwn(current, function (value, key) {
      if (_.isUndefined(value) || _.isNull(value) || _.isNaN(value) ||
        (_.isObject(value) && _.isEmpty(prune(value)))) {

        delete current[key];
      }
    });
    // remove any leftover undefined values from the delete
    // operation on an array
    if (_.isArray(current)) _.pull(current, undefined);

    return current;

  }(_.cloneDeep(obj));  // Do not modify the original object, create a clone instead
}

module.exports = User;
