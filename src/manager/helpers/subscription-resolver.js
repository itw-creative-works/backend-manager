const moment = require('moment');
const { get } = require('lodash');

function SubscriptionResolver(Manager, profile, resource) {
  const self = this;
  
  self.Manager = Manager;
  self.profile = profile;
  self.resource = resource;

  return self;
}

SubscriptionResolver.prototype.resolve = function (options) {
  const self = this;

  const resolved = {
    status: 'cancelled',
    frequency: 'monthly',
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
    lastPayment: {
      amount: 0,
      date: {
        timestamp: moment(0),
        timestampUNIX: moment(0),           
      }
    },
    trial: {
      active: false,
      daysLeft: 0,
    }
  }

  // Set
  const profile = self.profile;
  const resource = self.resource;

  // Set defaults
  profile.details = profile.details || {};
  profile.details.planFrequency = profile.details.planFrequency || null;
  
  // Set
  options = options || {};

  // Set provider if not set
  if (!profile.processor) {
    if (resource.billing_info) {
      profile.processor = 'paypal';
    } else if (resource.billing_period_unit) {
      profile.processor = 'chargebee';
    } else if (resource.customer) {
      profile.processor = 'stripe';
    } else if (resource.addresses) {
      profile.processor = 'coinbase';
    } else {
      throw new Error('Unable to determine subscription provider');
    }
  }

  // Log if requested
  if (options.log) {
    console.log('profile', profile);
    console.log('resource', resource);
  }  

  // Process differently based on each provider
  if (profile.processor === 'paypal') {
    // Set status
    /*
      subscription: https://developer.paypal.com/docs/api/subscriptions/v1/#subscriptions_get
      APPROVAL_PENDING. The subscription is created but not yet approved by the buyer. 
      APPROVED. The buyer has approved the subscription. 
      ACTIVE. The subscription is active. 
      SUSPENDED. The subscription is suspended.
      CANCELLED. The subscription is cancelled. 
      EXPIRED. The subscription is expired.

      order: https://developer.paypal.com/docs/api/orders/v2/#orders_get
      CREATED. The order was created with the specified context. 
      SAVED. The order was saved and persisted. The order status continues to be in progress until a capture is made with final_capture = true for all purchase units within the order. 
      APPROVED. The customer approved the payment through the PayPal wallet or another form of guest or unbranded payment. For example, a card, bank account, or so on. 
      VOIDED. All purchase units in the order are voided. COMPLETED. The payment was authorized or the authorized payment was captured for the order. 
      PAYER_ACTION_REQUIRED. The order requires an action from the payer (e.g. 3DS authentication). Redirect the payer to the "rel":"payer-action" HATEOAS link returned as part of the response prior to authorizing or capturing the order.
    */
    if (['ACTIVE'].includes(resource.status)) {
      resolved.status = 'active';
    } else if (['SUSPENDED'].includes(resource.status)) {
      resolved.status = 'suspended';
    } else {
      resolved.status = 'cancelled';
    }
    
    // Set resource ID
    resolved.resource.id = resource.id;

    // Set start
    resolved.start.timestamp = moment(
      get(resource, 'start_time', 0)
    )

    // Set expiration
    resolved.expires.timestamp = moment(
      get(resource, 'billing_info.last_payment.time', 0)
    )

    // Set last payment
    if (get(resource, 'billing_info.last_payment')) {
      resolved.lastPayment.amount = parseFloat(resource.billing_info.last_payment.amount.value);
      resolved.lastPayment.date.timestamp = moment(resource.billing_info.last_payment.time);
    } 

    // Get trial
    const trialTenure = get(resource, 'plan.billing_cycles', []).find((cycle) => cycle.tenure_type === 'TRIAL');
    const regularTenure = get(resource, 'plan.billing_cycles', []).find((cycle) => cycle.tenure_type === 'REGULAR');

    // Resolve trial
    /* 
      Special condition for PayPal 
      Because you cannot remove trial on a sub-level, you have to charge a prorated amount for the "trial".
      Even if charged, it is still considered a trial period by paypal.
      Thus, we must remove the trial indicator if the user has been charged.
    */
    if (
      resolved.status === 'active'
      && (trialTenure && regularTenure && regularTenure.total_cycles === 0)
      && resolved.lastPayment.amount === 0
    ) {
      resolved.trial.active = true;
      
      // Set expiration
      resolved.expires.timestamp = moment(
        get(resource, 'billing_info.next_billing_time', 0)
      )
    }

    // Resolve frequency
    const unit = regularTenure.frequency.interval_unit;
    if (unit === 'YEAR') {
      resolved.frequency = 'annually';
    } else if (unit === 'MONTH') {
      resolved.frequency = 'monthly';
    } else if (unit === 'WEEK') {
      resolved.frequency = 'weekly';      
    } else if (unit === 'DAY') {
      resolved.frequency = 'daily';
    } else {
      throw new Error('Unknown frequency');
    }
    
    // Set completed
    if (resource.plan_id) {
      resolved.payment.completed = !['APPROVAL_PENDING', 'APPROVED'].includes(resource.status);      
    } else {
      resolved.payment.completed = !['CREATED', 'SAVED', 'APPROVED', 'VOIDED', 'PAYER_ACTION_REQUIRED'].includes(resource.status);         
    }

  } else if (profile.processor === 'chargebee') {
    // Set status
    // subscription: https://apidocs.chargebee.com/docs/api/subscriptions?prod_cat_ver=2#subscription_status
    // future The subscription is scheduled to start at a future date. in_trial The subscription is in trial. active The subscription is active and will be charged for automatically based on the items in it. non_renewing The subscription will be canceled at the end of the current term. paused The subscription is paused. The subscription will not renew while in this state. cancelled The subscription has been canceled and is no longer in service.
    if (['in_trial', 'active'].includes(resource.status)) {
      resolved.status = 'active';
    } else if (['paused'].includes(resource.status)) {
      resolved.status = 'suspended';
    } else {
      resolved.status = 'cancelled';
    }

    // Set resource ID
    resolved.resource.id = resource.id;

    // Set start
    resolved.start.timestamp = moment(
      get(resource, 'created_at', 0) * 1000
    )

    // Set expiration
    resolved.expires.timestamp = moment(
      (
        get(resource, 'current_term_start', 0)
      ) * 1000
    )

    // Set last payment @@@ TODO
    // if (resource.billing_info && resource.billing_info.last_payment) {
    //   resolved.lastPayment.amount = parseFloat(resource.billing_info.last_payment.amount.value);
    //   resolved.lastPayment.date.timestamp = moment(resource.billing_info.last_payment.time);
    // }    

    // Get trial
    if (resource.status === 'in_trial') {
      resolved.trial.active = true;
      
      // Set expiration
      resolved.expires.timestamp = moment(
        (
          get(resource, 'trial_end', 0)
        ) * 1000
      )
    }

    // Resolve frequency
    const unit = resource.billing_period_unit;
    if (unit === 'year') {
      resolved.frequency = 'annually';
    } else if (unit === 'month') {
      resolved.frequency = 'monthly';
    } else if (unit === 'week') {
      resolved.frequency = 'weekly';      
    } else if (unit === 'day') {
      resolved.frequency = 'daily';
    } else {
      throw new Error('Unknown frequency');
    }

    // Set completed
    if (true) {
      resolved.payment.completed = !['future'].includes(resource.status);
    }

  } else if (profile.processor === 'stripe') {
    // Subscription: https://stripe.com/docs/api/subscriptions/object#subscription_object-status
    // incomplete, incomplete_expired, trialing, active, past_due, canceled, or unpaid

    // Charge: https://stripe.com/docs/api/payment_intents/object#payment_intent_object-status
    // requires_payment_method, requires_confirmation, requires_action, processing, requires_capture, canceled, or succeeded
    // Set status
    if (['trialing', 'active'].includes(resource.status)) {
      resolved.status = 'active';
    } else if (['past_due', 'unpaid'].includes(resource.status)) {
      resolved.status = 'suspended';
    } else {
      resolved.status = 'cancelled';
    }

    // Set resource ID
    resolved.resource.id = resource.id;

    // Set start
    resolved.start.timestamp = moment(
      get(resource, 'start_date', 0) * 1000
    );
    
    // Set expiration
    resolved.expires.timestamp = moment(
      get(resource, 'current_period_start', 0) * 1000
    );

    // Set last payment
    if (resource.latest_invoice) {
      resolved.lastPayment.amount = resource.latest_invoice.amount_paid / 100;
      resolved.lastPayment.date.timestamp = moment(
        get(resource, 'latest_invoice.created', 0) * 1000
      );
    }    

    // Get trial
    if (resource.status === 'trialing') {
      resolved.trial.active = true;

      // Set expiration
      resolved.expires.timestamp = moment(
        (
          get(resource, 'trial_end', 0)
        ) * 1000
      )
    }

    // Resolve frequency
    const unit = resource.plan.interval;
    if (unit === 'year') {
      resolved.frequency = 'annually';
    } else if (unit === 'month') {
      resolved.frequency = 'monthly';
    } else if (unit === 'week') {
      resolved.frequency = 'weekly';      
    } else if (unit === 'day') {
      resolved.frequency = 'daily';
    } else {
      throw new Error('Unknown frequency');
    }

    // Set completed
    if (resource.object === 'subscription') {
      resolved.payment.completed = !['incomplete', 'incomplete_expired'].includes(resource.status);      
    } else if (resource.object === 'payment_intent') {
      resolved.payment.completed = !['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'canceled'].includes(resource.status);      
    }

  } else if (profile.processor === 'coinbase') {
    // Set status
    resolved.status = 'cancelled';

    // Set resource ID
    resolved.resource.id = resource.id;

    // Set start
    resolved.start.timestamp = moment(
      get(resource, 'created_at', 0)
    );

    // Set expiration
    resolved.expires.timestamp = moment(
      get(resource, 'created_at', 0)
    );

    // Set last payment
    if (lastPayment) {
      resolved.lastPayment.amount = parseFloat(lastPayment.value.local.amount);
      resolved.lastPayment.date.timestamp = moment(lastPayment.detected_at);
    }    

    // Get trial
    if (true) {
      resolved.trial.active = false;
    }

    // Resolve frequency
    const unit = profile.details.planFrequency;
    if (unit) {
      resolved.frequency = unit;
    } else {
      throw new Error('Unknown frequency');
    }

    // Set completed
    const lastPayment = resource.payments.find(p => p.status === 'CONFIRMED');
    if (true) {
      resolved.payment.completed = !!lastPayment;
    }

  } else {
    throw new Error('Unknown processor');
  }

  // Fix expiry by adding time to the date of last payment
  if (resolved.status === 'active') {
    // Set days left
    if (resolved.trial.active) {
      resolved.trial.daysLeft = resolved.expires.timestamp.diff(moment(), 'days');        
    }

    // Set expiration
    resolved.expires.timestamp.add(1, 'year').add(30, 'days');
  } else {
    // If trial, it's already set to the trial end above
    if (!resolved.trial.active) {
      if (resolved.frequency === 'annually') {
        resolved.expires.timestamp.add(1, 'year');
      } else if (resolved.frequency === 'monthly') {
        resolved.expires.timestamp.add(1, 'month');
      } else if (resolved.frequency === 'weekly') {
        resolved.expires.timestamp.add(1, 'week');        
      } else if (resolved.frequency === 'daily') {
        resolved.expires.timestamp.add(1, 'day');
      }      
    }
  }

  // If there was NEVER any payment sent AND they are not trialing
  if (!resolved.payment.completed && !resolved.trial.active) {
    resolved.expires.timestamp = moment(0);
  }

  // Fix timestamps
  resolved.expires.timestampUNIX = resolved.expires.timestamp.unix();
  resolved.expires.timestamp = resolved.expires.timestamp.toISOString();

  resolved.start.timestampUNIX = resolved.start.timestamp.unix();
  resolved.start.timestamp = resolved.start.timestamp.toISOString();

  // Fix trial days
  resolved.trial.daysLeft = resolved.trial.daysLeft < 0 ? 0 : resolved.trial.daysLeft;

  // Set last payment
  resolved.lastPayment.date.timestampUNIX = moment(resolved.lastPayment.date.timestamp).unix();
  resolved.lastPayment.date.timestamp = resolved.lastPayment.date.timestamp.toISOString();
  
  // Log if needed
  if (options.log) {
    console.log('resolved', resolved);
  }

  self.resolved = resolved;

  return resolved;  
};

module.exports = SubscriptionResolver;
