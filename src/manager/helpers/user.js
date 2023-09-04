const _ = require('lodash');
const uuid4 = require('uuid').v4;
const shortid = require('shortid');
const powertools = require('node-powertools');
const UIDGenerator = require('uid-generator');
const uidgen = new UIDGenerator(256);

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
      uid: _.get(settings, 'auth.uid', null),
      email: _.get(settings, 'auth.email', null),
      temporary: _.get(settings, 'auth.temporary', defaults ? false : null),
    },
    roles: {
      admin: _.get(settings, 'roles.admin', defaults ? false : null),
      betaTester: _.get(settings, 'roles.betaTester', defaults ? false : null),
      developer: _.get(settings, 'roles.developer', defaults ? false : null),
    },
    plan: {
      id: _.get(settings, 'plan.id', defaults ? 'basic' : null), // intro | basic | advanced | premium
      expires: {
        timestamp: _.get(settings, 'plan.expires.timestamp', defaults ? oldDate : null),
        timestampUNIX: _.get(settings, 'plan.expires.timestampUNIX', defaults ? oldDateUNIX : null),
      },
      trial: {
        activated: _.get(settings, 'plan.trial.activated', defaults ? false : null),
        expires: {
          timestamp: _.get(settings, 'plan.trial.expires.timestamp', defaults ? oldDate : null),
          timestampUNIX: _.get(settings, 'plan.trial.expires.timestampUNIX', defaults ? oldDateUNIX : null),
        },
      },
      limits: {
        // devices: _.get(settings, 'plan.limits.devices', null),
      },
      payment: {
        processor: _.get(settings, 'plan.payment.processor', null), // paypal | stripe | chargebee, etc
        orderId: _.get(settings, 'plan.payment.orderId', null), // xxx-xxx-xxx
        resourceId: _.get(settings, 'plan.payment.resourceId', null), // x-xxxxxx
        frequency: _.get(settings, 'plan.payment.frequency', null), // monthly || annually
        startDate: {
          timestamp: _.get(settings, 'plan.payment.startDate.timestamp', defaults ? now : null), // x-xxxxxx
          timestampUNIX: _.get(settings, 'plan.payment.startDate.timestampUNIX', defaults ? nowUNIX : null), // x-xxxxxx
        },
        active: _.get(settings, 'plan.payment.active', defaults ? false : null), // true | false
        updatedBy: {
          event: {
            name: _.get(settings, 'plan.payment.updatedBy.event.name', null), // x-xxxxxx
            id: _.get(settings, 'plan.payment.updatedBy.event.id', null), // x-xxxxxx
          },
          date: {
            timestamp: _.get(settings, 'plan.payment.updatedBy.date.timestamp', defaults ? now : null), // x-xxxxxx
            timestampUNIX: _.get(settings, 'plan.payment.updatedBy.date.timestampUNIX', defaults ? nowUNIX : null), // x-xxxxxx
          },
        },
      }
    },
    affiliate: {
      code: _.get(settings, 'affiliate.code', defaults ? shortid.generate() : null),
      referrals: [],
      referrer: _.get(settings, 'affiliate.referrer', null),
    },
    activity: {
      lastActivity: {
        timestamp: _.get(settings, 'activity.lastActivity.timestamp', defaults ? now : null),
        timestampUNIX: _.get(settings, 'activity.lastActivity.timestampUNIX', defaults ? nowUNIX : null),
      },
      created: {
        timestamp: _.get(settings, 'activity.created.timestamp', defaults ? now : null),
        timestampUNIX: _.get(settings, 'activity.created.timestampUNIX', defaults ? nowUNIX : null),
      },
      geolocation: {
        ip: _.get(settings, 'activity.geolocation.ip', defaults ? '' : null),
        continent: _.get(settings, 'activity.geolocation.continent', defaults ? '' : null),
        country: _.get(settings, 'activity.geolocation.country', defaults ? '' : null),
        city: _.get(settings, 'activity.geolocation.city', defaults ? '' : null),
        latitude: _.get(settings, 'activity.geolocation.latitude', defaults ? 0 : null),
        longitude: _.get(settings, 'activity.geolocation.longitude', defaults ? 0 : null),
        userAgent: _.get(settings, 'activity.geolocation.userAgent', defaults ? '' : null),
        language: _.get(settings, 'activity.geolocation.language', defaults ? '' : null),
        platform: _.get(settings, 'activity.geolocation.platform', defaults ? '' : null),
      },
    },
    api: {
      clientId: _.get(settings, 'api.clientId', defaults ? `${uuid4()}` : null),
      privateKey: _.get(settings, 'api.privateKey', defaults ? `${uidgen.generateSync()}` : null),
    },
    personal: {
      birthday: {
        timestamp: _.get(settings, 'personal.birthday.timestamp', defaults ? oldDate : null),
        timestampUNIX: _.get(settings, 'personal.birthday.timestampUNIX', defaults ? oldDateUNIX : null),
      },
      gender: _.get(settings, 'personal.gender', defaults ? '' : null),
      location: {
        city: _.get(settings, 'personal.location.city', defaults ? '' : null),
        country: _.get(settings, 'personal.location.country', defaults ? '' : null),
      },
      name: {
        first: _.get(settings, 'personal.name.first', defaults ? '' : null),
        last: _.get(settings, 'personal.name.last', defaults ? '' : null),
      },
      telephone: {
        countryCode: _.get(settings, 'personal.telephone.countryCode', defaults ? 0 : null),
        national: _.get(settings, 'personal.telephone.national', defaults ? 0 : null),
      },
    },
  }

  if (options.prune) {
    self.properties = pruneObject(self.properties);
  }

  self.resolve = function (options) {
    options = options || {};
    options.defaultPlan = options.defaultPlan || 'basic';
    const planId = _.get(self.properties, 'plan.id', options.defaultPlan);
    const premiumExpire = _.get(self.properties, 'plan.expires.timestamp', 0);

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
