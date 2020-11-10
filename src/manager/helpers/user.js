const _ = require('lodash');
const uuid4 = require('uuid').v4;
const shortid = require('shortid');
const powertools = require('node-powertools');
const UIDGenerator = require('uid-generator');
const uidgen = new UIDGenerator(256);

function User(options) {
  let self = this;
  options = options || {};
  let now = powertools.timestamp(new Date(), {output: 'string'});
  let nowUNIX = powertools.timestamp(now, {output: 'unix'});
  let oldDate = powertools.timestamp(new Date('1999/01/01'), {output: 'string'})
  let oldDateUNIX = powertools.timestamp(oldDate, {output: 'unix'});

  self.properties = {
    auth: {
      uid: _.get(options, 'auth.uid', null),
      email: _.get(options, 'auth.email', null),
      temporary: _.get(options, 'auth.temporary', false),
    },
    roles: {
      admin: _.get(options, 'roles.admin', false),
      betaTester: _.get(options, 'roles.betaTester', false),
      developer: _.get(options, 'roles.developer', false),
    },
    plan: {
      id: _.get(options, 'plan.id', 'basic'), // intro | basic | advanced | premium
      expires: {
        timestamp: oldDate,
        timestampUNIX: oldDateUNIX,
      },
      // enterprise: {
      //   limits: {
      //     // ...
      //     // accounts: 0,
      //   }
      // },
      payment: {
        method: null, // paypal | stripe | chargebee, etc
        // data: {
        //   // Data from payment processor like
        // }
      }
    },
    affiliate: {
      code: _.get(options, 'affiliate.code', shortid.generate()),
      referrals: {

      },
      referredBy: _.get(options, 'affiliate.referredBy', null),
    },
    activity: {
      lastActivity: {
        timestamp: _.get(options, 'activity.lastActivity.timestamp', now),
        timestampUNIX: _.get(options, 'activity.lastActivity.timestampUNIX', nowUNIX),
      },
      created: {
        timestamp: _.get(options, 'activity.lastActivity.timestamp', now),
        timestampUNIX: _.get(options, 'activity.lastActivity.timestampUNIX', nowUNIX),
      },
    },
    api: {
      clientId: _.get(options, 'api.clientId', `${uuid4()}`),
      privateKey: _.get(options, 'api.privateKey', `${uidgen.generateSync()}`),
    },
  }

  return self;
}

module.exports = User;
