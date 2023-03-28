const moment = require('moment');
const { get } = require('lodash');

function SubscriptionResolver(profile, resource) {
  const self = this;
  
  self.profile = profile;
  self.resource = resource;
}

SubscriptionResolver.prototype.resolve = function (options) {
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
    trial: {
      active: false,
    }
  }

  const profile = self.profile;
  const resource = self.resource;

  options = options || {};

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

    // Get trial
    const trialTenure = get(resource, 'billing_info.cycle_executions', []).find((cycle) => cycle.tenure_type === 'TRIAL');
    const regularTenure = get(resource, 'billing_info.cycle_executions', []).find((cycle) => cycle.tenure_type === 'REGULAR');

    // Resolve trial
    if (trialTenure && regularTenure && regularTenure.cycles_completed === 0) {
      resolved.trial.active = true;
      
      // Set expiration and start
      // resolved.expires.timestamp = moment(
      //   get(resource, 'billing_info.next_billing_time', 0)
      // )
      resolved.expires.timestamp = moment();
    } else {
      // Set expiration and start
      resolved.expires.timestamp = moment(
        get(resource, 'billing_info.last_payment.time', 0)
      )
    }

    resolved.start.timestamp = moment(
      get(resource, 'start_time', 0)
    )
    
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

    // Get trial
    if (resource.status === 'in_trial') {
      resolved.trial.active = true;
      
      // Set expiration and start
      resolved.expires.timestamp = moment();

      // resolved.expires.timestamp = moment(
      //   (
      //     get(resource, 'current_term_start', 0)
      //     || get(resource, 'current_term_start', 0)
      //   ) * 1000
      // )      
    } else {
      // Set expiration and start
      resolved.expires.timestamp = moment(
        (
          get(resource, 'current_term_start', 0)
        ) * 1000
      )
    }

    resolved.start.timestamp = moment(
      get(resource, 'created_at', 0) * 1000
    )    

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
    } if (['past_due', 'unpaid'].includes(resource.status)) {
      resolved.status = 'suspended';
    } else {
      resolved.status = 'cancelled';
    }

    // Set resource ID
    resolved.resource.id = resource.id;

    // Get trial
    if (resource.status === 'trialing') {
      resolved.trial.active = true;

      // Set expiration and start
      resolved.expires.timestamp = moment();      
    } else {
      // Set expiration and start
      resolved.expires.timestamp = moment(
        get(resource, 'current_period_start', 0) * 1000
      );      
    }    

    resolved.start.timestamp = moment(
      get(resource, 'start_date', 0) * 1000
    );

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

    // Get trial
    if (true) {
      resolved.trial.active = false;
    }

    // Set expiration and start
    resolved.expires.timestamp = moment(
      get(resource, 'created_at', 0)
    );
    resolved.start.timestamp = moment(
      get(resource, 'created_at', 0)
    );

    // Set completed
    if (true) {
      resolved.payment.completed = !!resource.payments.find(p => p.status === 'CONFIRMED');
    }
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

  // If trial, set to a max of 1 month
  if (resolved.trial.active) {
    resolved.expires.timestamp = moment().add(1, 'month');
  }

  // Fix timestamps
  resolved.expires.timestampUNIX = resolved.expires.timestamp.unix()
  resolved.expires.timestamp = resolved.expires.timestamp.toISOString()

  resolved.start.timestampUNIX = resolved.start.timestamp.unix()
  resolved.start.timestamp = resolved.start.timestamp.toISOString()  

  // console.log('---resolved', resolved);

  if (options.log) {
    console.log('resolved', resolved);
  }

  self.resolved = resolved;

  return resolved;  
};

module.exports = SubscriptionResolver;
