const _ = require('lodash');
const uuid4 = require('uuid').v4;
const shortid = require('shortid');
const powertools = require('node-powertools');
const UIDGenerator = require('uid-generator');
const uidgen = new UIDGenerator(256);

function User(settings, options) {
  let self = this;
  settings = settings || {};
  options = options || {};
  let now = powertools.timestamp(new Date(), {output: 'string'});
  let nowUNIX = powertools.timestamp(now, {output: 'unix'});
  let oldDate = powertools.timestamp(new Date('1999/01/01'), {output: 'string'})
  let oldDateUNIX = powertools.timestamp(oldDate, {output: 'unix'});

  self.properties = {
    auth: {
      uid: _.get(settings, 'auth.uid', null),
      email: _.get(settings, 'auth.email', null),
      temporary: _.get(settings, 'auth.temporary', false),
    },
    roles: {
      admin: _.get(settings, 'roles.admin', false),
      betaTester: _.get(settings, 'roles.betaTester', false),
      developer: _.get(settings, 'roles.developer', false),
    },
    plan: {
      id: _.get(settings, 'plan.id', 'basic'), // intro | basic | advanced | premium
      expires: {
        timestamp: oldDate,
        timestampUNIX: oldDateUNIX,
      },
      limits: {
        devices: _.get(settings, 'plan.limits.devices', 1),
      },
      payment: {
        processor: _.get(settings, 'plan.payment.processor', null), // paypal | stripe | chargebee, etc
        orderId: _.get(settings, 'plan.payment.orderId', null), // xxx-xxx-xxx
        resourceId: _.get(settings, 'plan.payment.resourceId', null), // x-xxxxxx
        startDate: {
          timestamp: _.get(settings, 'plan.payment.data.timestamp', now), // x-xxxxxx
          timestampUNIX: _.get(settings, 'plan.payment.data.timestampUNIX', nowUNIX), // x-xxxxxx
        }
      }
    },
    affiliate: {
      code: _.get(settings, 'affiliate.code', shortid.generate()),
      referrals: {

      },
      referredBy: _.get(settings, 'affiliate.referredBy', null),
    },
    activity: {
      lastActivity: {
        timestamp: _.get(settings, 'activity.lastActivity.timestamp', now),
        timestampUNIX: _.get(settings, 'activity.lastActivity.timestampUNIX', nowUNIX),
      },
      created: {
        timestamp: _.get(settings, 'activity.lastActivity.timestamp', now),
        timestampUNIX: _.get(settings, 'activity.lastActivity.timestampUNIX', nowUNIX),
      },
    },
    api: {
      clientId: _.get(settings, 'api.clientId', `${uuid4()}`),
      privateKey: _.get(settings, 'api.privateKey', `${uidgen.generateSync()}`),
    },
  }

  if (options.prune) {
    self.properties = pruneObject(self.properties);
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
