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
    status: 'cancelled',
    resource: {
      id: '',
    },
    payment: {
      completed: false,
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

  // Process differently based on each provider
  if (profile.processor === 'paypal') {
    // Set status
    if (['ACTIVE'].includes(resource.status)) {
      resolved.status = 'active';
    } else if (['SUSPENDED'].includes(resource.status)) {
      resolved.status = 'suspended';
    } else {
      resolved.status = 'cancelled';
    }
    
    // Set resource ID
    resolved.resource.id = resource.id;

    // Set expiration and start
    resolved.expires.timestamp = moment(
      get(resource, 'billing_info.last_payment.time', 0)
    )
    resolved.start.timestamp = moment(
      get(resource, 'start_time', 0)
    )
    
    // Set completed
    resolved.payment.completed = !['APPROVAL_PENDING', 'APPROVED'].includes(resource.status);
  } else if (profile.processor === 'chargebee') {
    // Set status
    if (['in_trial', 'active'].includes(resource.status)) {
      resolved.status = 'active';
    } else if (['paused'].includes(resource.status)) {
      resolved.status = 'suspended';
    } else {
      resolved.status = 'cancelled';
    }

    // Set resource ID
    resolved.resource.id = resource.id;

    // Set expiration and start
    resolved.expires.timestamp = moment(
      get(resource, 'current_term_start', 0) * 1000
    )
    resolved.start.timestamp = moment(
      get(resource, 'created_at', 0) * 1000
    )    

    // Set completed
    resolved.payment.completed = !['future'].includes(resource.status);
  } else if (profile.processor === 'stripe') {
    // Set status
    if (['trialing', 'active'].includes(resource.status)) {
      resolved.status = 'active';
    } if (['past_due', 'unpaid'].includes(resource.status)) {
      resolved.status = 'suspended';
    } else {
      resolved.status = 'cancelled';
    }

    // Set resource ID
    resolved.resource.id = resource.id;

    // Set expiration and start
    resolved.expires.timestamp = moment(
      get(resource, 'current_period_start', 0) * 1000
    );
    resolved.start.timestamp = moment(
      get(resource, 'start_date', 0) * 1000
    );

    // Set completed
    resolved.payment.completed = !['incomplete', 'incomplete_expired'].includes(resource.status);
  } else if (profile.processor === 'coinbase') {
    // Set status
    resolved.status = 'cancelled';

    // Set resource ID
    resolved.resource.id = resource.id;

    // Set expiration and start
    resolved.expires.timestamp = moment(
      get(resource, 'created_at', 0)
    );
    resolved.start.timestamp = moment(
      get(resource, 'created_at', 0)
    );

    // Set completed
    resolved.payment.completed = !!resource.payments.find(p => p.status === 'CONFIRMED');
  }

  // If there was NEVER any payment sent
  if (!resolved.payment.completed) {
    resolved.expires.timestamp = moment(0);
  }  

  // Fix expires by adding time to the date of last payment
  if (resolved.status === 'active') {
    resolved.expires.timestamp.add(1, 'year').add(30, 'days');
  } else {
    const freq = profile.details.planFrequency || 'monthly';
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
