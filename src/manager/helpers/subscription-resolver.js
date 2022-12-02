const moment = require('moment');
const { get } = require('lodash');

function SubscriptionResolver(profile, resource) {
  const self = this;
  
  self.profile = profile;
  self.resource = resource;
}

SubscriptionResolver.prototype.resolve = function () {
  const self = this;

  const resolved = {
    status: '',
    resource: {
      id: '',
    },
    expires: {
      timestamp: moment(0),
      timestampUNIX: moment(0),
    },
    start: {
      timestamp: moment(0),
      timestampUNIX: moment(0),
    },
  }

  const profile = self.profile;
  const resource = self.resource;

  if (profile.processor === 'paypal') {
    if (resource.status === 'ACTIVE') {
      resolved.status = 'active';
    } else if (resource.status === 'SUSPENDED') {
      resolved.status = 'suspended';
    } else {
      resolved.status = 'cancelled';
    }
    resolved.resource.id = resource.id,
    resolved.expires.timestamp = moment(
      get(resource, 'billing_info.last_payment.time', 0)
    )
    resolved.start.timestamp = moment(
      get(resource, 'start_time', 0)
    )    
  } else if (profile.processor === 'chargebee') {
    if (resource.status === 'active') {
      resolved.status = 'active';
    } else if (resource.status === 'paused') {
      resolved.status = 'suspended';
    } else {
      resolved.status = 'cancelled';
    }
    resolved.resource.id = resource.id,
    resolved.expires.timestamp = moment(
      get(resource, 'current_term_start', 0) * 1000
    )
    resolved.start.timestamp = moment(
      get(resource, 'created_at', 0) * 1000
    )    
  } else if (profile.processor === 'stripe') {
    if (resource.status === 'active') {
      resolved.status = 'active';
    } else if (resource.status === 'past_due' || resource.status === 'unpaid' || resource.status === 'incomplete' || resource.status === 'incomplete_expired') {
      resolved.status = 'suspended';
    } else {
      resolved.status = 'cancelled';
    }
    resolved.resource.id = resource.id,
    resolved.expires.timestamp = moment(
      get(resource, 'current_period_start', 0) * 1000
    )
    resolved.start.timestamp = moment(
      get(resource, 'start_date', 0) * 1000
    )
  } else if (profile.processor === 'coinbase') {
    // TODO: look in to how to detect a failed payment
    // const completed = resource.confirmed_at;
    const completed = resource.payments.find(p => p.status === 'CONFIRMED');
    resolved.status = 'cancelled';

    resolved.resource.id = resource.id,
    resolved.expires.timestamp = moment(
      get(resource, 'created_at', 0)
    )
    resolved.start.timestamp = moment(
      get(resource, 'created_at', 0)
    );

    // SPECIAL:
    // Special coinbase condition: if it was never completed, it was never paid
    if (!completed) {
      resolved.expires.timestamp = moment(0);
    }
  }

  // Fix expires by adding time to the date of last payment
  if (resolved.status === 'active') {
    resolved.expires.timestamp.add(1, 'year').add(30, 'days');
  } else {
    const freq = profile.details.planFrequency;
    if (freq === 'annually') {
      resolved.expires.timestamp.add(1, 'year');
    } else if (freq === 'monthly') {
      resolved.expires.timestamp.add(1, 'month');
    } else if (freq === 'daily') {
      resolved.expires.timestamp.add(1, 'day');
    }
  }

  // Fix timestamps
  resolved.expires.timestampUNIX = resolved.expires.timestamp.unix()
  resolved.expires.timestamp = resolved.expires.timestamp.toISOString()

  resolved.start.timestampUNIX = resolved.start.timestamp.unix()
  resolved.start.timestamp = resolved.start.timestamp.toISOString()  

  // console.log('---resolved', resolved);

  self.resolved = resolved;

  return resolved;  
};

module.exports = SubscriptionResolver;
